"use client";

type Props = {
  fileUrl: string;
  fileName?: string;
  onClose: () => void;
};

function getFileType(
  url: string,
  fileName?: string
): "image" | "video" | "audio" | "pdf" | "other" {
  const name = (fileName || url).toLowerCase();

  if (/\.(jpg|jpeg|png|gif|webp|svg)$/.test(name))
    return "image";
  if (/\.(mp4|webm|ogg|mov)$/.test(name))
    return "video";
  if (/\.(mp3|wav|ogg|aac)$/.test(name))
    return "audio";
  if (/\.pdf$/.test(name)) return "pdf";

  return "other";
}

export default function FilePreviewModal({
  fileUrl,
  fileName,
  onClose,
}: Props) {
  const fileType = getFileType(fileUrl, fileName);

  return (
    <div
      className="
        fixed
        inset-0
        bg-black/60
        flex
        items-center
        justify-center
        z-50
      "
      onClick={onClose}
    >
      <div
        className="
          bg-white
          dark:bg-zinc-900
          rounded-lg
          p-4
          w-[90vw]
          max-w-3xl
          max-h-[85vh]
          flex
          flex-col
        "
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-sm truncate">
            {fileName || "File Preview"}
          </span>

          <div className="flex items-center gap-3 shrink-0 ml-4">
            <a
              href={fileUrl}
              download={fileName}
              className="text-sm text-blue-500 hover:underline"
            >
              Download
            </a>

            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-700 text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto flex items-center justify-center">
          {fileType === "image" && (
            <img
              src={fileUrl}
              alt={fileName}
              className="max-w-full max-h-[70vh] object-contain rounded"
            />
          )}

          {fileType === "video" && (
            <video
              src={fileUrl}
              controls
              className="max-w-full max-h-[70vh] rounded"
            />
          )}

          {fileType === "audio" && (
            <audio
              src={fileUrl}
              controls
              className="w-full"
            />
          )}

          {(fileType === "pdf" || fileType === "other") && (
            <iframe
              src={fileUrl}
              className="w-full h-[65vh] rounded border"
            />
          )}
        </div>
      </div>
    </div>
  );
}
