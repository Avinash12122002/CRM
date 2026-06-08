"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $getRoot } from "lexical";
import ToolbarPlugin from "./ToolbarPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";

const theme = {
  paragraph: "mb-2",
  quote: "border-l-4 border-gray-300 pl-4 italic my-2",
  heading: {
    h1: "text-3xl font-bold mb-4",
    h2: "text-2xl font-bold mb-3",
    h3: "text-xl font-bold mb-2",
  },
  list: {
    nested: {
      listitem: "list-none",
    },
    ol: "list-decimal list-inside my-2",
    ul: "list-disc list-inside my-2",
    listitem: "ml-4",
  },
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline",
    code: "bg-gray-100 px-1 py-0.5 rounded font-mono text-sm",
  },
  code: "bg-gray-100 p-4 rounded my-2 font-mono text-sm block",
  link: "text-blue-600 underline hover:text-blue-800",
};

function onError(error: Error) {
  console.error(error);
}

type OnChangePluginProps = {
  onChange: (html: string) => void;
};

function OnChangePlugin({ onChange }: OnChangePluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const htmlString = $generateHtmlFromNodes(editor);
        onChange(htmlString);
      });
    });
  }, [editor, onChange]);

  return null;
}

type SetContentPluginProps = {
  content: string;
};

function SetContentPlugin({ content }: SetContentPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (content && content !== "<p></p>" && content !== "") {
      editor.update(() => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(content, "text/html");
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();
        root.clear();
        // $insertNodes(nodes);
        root.append(...nodes);
      });
    }
  }, [content, editor]);

  return null;
}

type LexicalEditorProps = {
  initialContent?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
};

export default function LexicalEditor({
  initialContent = "",
  onChange,
  placeholder = "Enter text...",
  minHeight = "300px",
}: LexicalEditorProps) {
  const initialConfig = {
    namespace: "VacancyEditor",
    theme,
    onError,
    nodes: [HeadingNode, ListNode, ListItemNode, QuoteNode, CodeNode, LinkNode],
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <ToolbarPlugin />
        <div className="relative bg-white">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="outline-none p-4 text-gray-900"
                style={{ minHeight }}
              />
            }
            placeholder={
              <div
                className="absolute top-4 left-4 text-gray-400 pointer-events-none"
                style={{ userSelect: "none" }}
              >
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <OnChangePlugin onChange={onChange} />
      {initialContent && <SetContentPlugin content={initialContent} />}
    </LexicalComposer>
  );
}
