"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useCallback, useEffect, useState } from "react";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  HeadingTagType,
} from "@lexical/rich-text";
import { $getNearestNodeOfType } from "@lexical/utils";

const LowPriority = 1;

export default function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [blockType, setBlockType] = useState("paragraph");

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Update text format
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));

      // Update block type
      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();
      const elementKey = element.getKey();
      const elementDOM = editor.getElementByKey(elementKey);

      if (elementDOM !== null) {
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType(anchorNode, ListNode);
          const type = parentList
            ? parentList.getListType()
            : element.getListType();
          setBlockType(type);
        } else {
          const type = $isHeadingNode(element)
            ? element.getTag()
            : element.getType();
          setBlockType(type);
        }
      }
    }
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      LowPriority
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  const formatHeading = (headingSize: HeadingTagType) => {
    if (blockType !== headingSize) {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(headingSize));
        }
      });
    }
  };

  const formatBulletList = () => {
    if (blockType !== "bullet") {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const formatNumberedList = () => {
    if (blockType !== "number") {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const formatQuote = () => {
    if (blockType !== "quote") {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });
    }
  };

  return (
    <div className="flex flex-wrap gap-2 p-3 border-b border-gray-300 bg-gray-50">
      <button
        type="button"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        }}
        className={`px-3 py-2 rounded-md font-semibold transition-colors ${
          isBold
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
        }`}
        title="Bold"
        aria-label="Format Bold"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        }}
        className={`px-3 py-2 rounded-md italic font-medium transition-colors ${
          isItalic
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
        }`}
        title="Italic"
        aria-label="Format Italic"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
        }}
        className={`px-3 py-2 rounded-md underline transition-colors ${
          isUnderline
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
        }`}
        title="Underline"
        aria-label="Format Underline"
      >
        U
      </button>
      <div className="w-px h-8 bg-gray-300 mx-1" />
      <button
        type="button"
        onClick={() => formatHeading("h2")}
        className={`px-3 py-2 rounded-md font-semibold transition-colors ${
          blockType === "h2"
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
        }`}
        title="Heading 2"
        aria-label="Heading 2"
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => formatHeading("h3")}
        className={`px-3 py-2 rounded-md font-semibold transition-colors ${
          blockType === "h3"
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
        }`}
        title="Heading 3"
        aria-label="Heading 3"
      >
        H3
      </button>
      <div className="w-px h-8 bg-gray-300 mx-1" />
      <button
        type="button"
        onClick={formatBulletList}
        className={`px-3 py-2 rounded-md transition-colors ${
          blockType === "bullet"
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
        }`}
        title="Bullet List"
        aria-label="Bullet List"
      >
        • List
      </button>
      <button
        type="button"
        onClick={formatNumberedList}
        className={`px-3 py-2 rounded-md transition-colors ${
          blockType === "number"
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
        }`}
        title="Numbered List"
        aria-label="Numbered List"
      >
        1. List
      </button>
      <button
        type="button"
        onClick={formatQuote}
        className={`px-3 py-2 rounded-md transition-colors ${
          blockType === "quote"
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
        }`}
        title="Quote"
        aria-label="Quote"
      >
        &ldquo; Quote
      </button>
    </div>
  );
}
