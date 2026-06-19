"use client";

import { useState } from "react";
import toast from "react-hot-toast";

type Props = {
  conversationId?: number;
  isGlobal?: boolean;
  onUploadSuccess: () => void;
};

export default function FileUpload({
  conversationId,
  isGlobal = false,
  onUploadSuccess,
}: Props) {
  const [uploading, setUploading] =
    useState(false);

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    try {
      setUploading(true);

      const formData =
        new FormData();

      formData.append(
        "file",
        file,
      );

      const uploadRes =
        await fetch(
          "/api/chat/files/upload",
          {
            method: "POST",
            body: formData,
          },
        );

      const uploadData =
        await uploadRes.json();

      if (!uploadRes.ok) {
        toast.error(
          uploadData.message ||
            "Upload failed",
        );
        return;
      }

      // Global chat messages go to a different endpoint
      // and don't take a conversationId.
      const endpoint = isGlobal
        ? "/api/chat/global-chat/messages"
        : "/api/chat/messages";

      const payload: Record<string, any> = {
        type: "file",
        message: "",
        fileId: uploadData.fileId,
        fileName: uploadData.fileName,
      };

      if (!isGlobal) {
        payload.conversationId = conversationId;
      }

      const sendRes =
        await fetch(endpoint, {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(payload),
        });

      const sendData =
        await sendRes.json();

      if (!sendRes.ok) {
        toast.error(
          sendData.message
        );

        return;
      }

      toast.success(
        "File uploaded",
      );

      onUploadSuccess();
    } catch (err) {
      console.error(err);

      toast.error(
        "Upload failed",
      );
    } finally {
      setUploading(false);

      // reset so the same file can be selected again
      e.target.value = "";
    }
  };

  return (
    <label
      className="
        cursor-pointer
        px-4
        py-2
        border
        rounded-lg
        hover:bg-zinc-100
        dark:hover:bg-zinc-800
      "
    >
      {uploading
        ? "Uploading..."
        : "📎"}

      <input
        type="file"
        className="hidden"
        onChange={
          handleUpload
        }
        disabled={uploading}
      />
    </label>
  );
}
