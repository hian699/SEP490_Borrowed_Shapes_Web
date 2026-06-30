"use client";

import { useEffect, useRef, useState } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import {
  ClassicEditor,
  Essentials,
  Paragraph,
  Heading,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  List,
  TodoList,
  BlockQuote,
  CodeBlock,
  Table,
  TableToolbar,
  HorizontalLine,
  Image,
  ImageUpload,
  ImageInsert,
  ImageResize,
  ImageToolbar,
  Autoformat,
  Markdown,
  type EditorConfig,
  type Editor,
} from "ckeditor5";
import "ckeditor5/ckeditor5.css";
import "./ckeditor-theme.css";
import { useI18n } from "@/lib/i18/i18n-context";
import { createWikiUploadPlugin } from "./ckeditor-upload-adapter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export interface WikiEditorValue {
  en: string;
  vi: string;
}

interface Props {
  value: WikiEditorValue;
  onChange: (next: WikiEditorValue) => void;
  readonly?: boolean;
  onUploadError?: (msg: string) => void;
  activeLocale?: "en" | "vi";
  hideLocaleTabs?: boolean;
  wikiId: string;
}

function buildConfig(
  onUploadError: ((msg: string) => void) | undefined,
  wikiId: string,
): EditorConfig {
  return {
    licenseKey: "GPL",
    plugins: [
      Essentials,
      Paragraph,
      Heading,
      Bold,
      Italic,
      Strikethrough,
      Code,
      Link,
      List,
      TodoList,
      BlockQuote,
      CodeBlock,
      Table,
      TableToolbar,
      HorizontalLine,
      Image,
      ImageUpload,
      ImageInsert,
      ImageResize,
      ImageToolbar,
      Autoformat,
      Markdown,
    ],
    extraPlugins: [createWikiUploadPlugin(onUploadError, wikiId)],
    toolbar: {
      items: [
        "heading",
        "|",
        "bold",
        "italic",
        "strikethrough",
        "code",
        "|",
        "link",
        "|",
        "bulletedList",
        "numberedList",
        "todoList",
        "|",
        "blockQuote",
        "codeBlock",
        "|",
        "insertTable",
        "horizontalLine",
        "|",
        "uploadImage",
      ],
      shouldNotGroupWhenFull: false,
    },
    heading: {
      options: [
        { model: "paragraph", title: "Paragraph", class: "ck-heading_paragraph" },
        { model: "heading1", view: "h1", title: "Heading 1", class: "ck-heading_heading1" },
        { model: "heading2", view: "h2", title: "Heading 2", class: "ck-heading_heading2" },
        { model: "heading3", view: "h3", title: "Heading 3", class: "ck-heading_heading3" },
      ],
    },
    link: {
      addTargetToExternalLinks: true,
      defaultProtocol: "https://",
    },
    table: {
      contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"],
    },
    image: {
      // Click anh -> hien toolbar resize. % de responsive theo container.
      toolbar: [
        "resizeImage:25",
        "resizeImage:50",
        "resizeImage:75",
        "resizeImage:original",
      ],
      resizeOptions: [
        { name: "resizeImage:original", value: null, label: "Original" },
        { name: "resizeImage:25", value: "25", label: "25%" },
        { name: "resizeImage:50", value: "50", label: "50%" },
        { name: "resizeImage:75", value: "75", label: "75%" },
      ],
      resizeUnit: "%",
    },
  };
}

export function WikiEditor({
  value,
  onChange,
  readonly = false,
  onUploadError,
  activeLocale,
  hideLocaleTabs = false,
  wikiId,
}: Props) {
  const { t } = useI18n();
  const [internalTab, setInternalTab] = useState<"en" | "vi">("en");
  const activeTab = activeLocale ?? internalTab;

  const editorRef = useRef<Editor | null>(null);
  // Latest-value refs cho callback onChange (tao 1 lan, tranh capture stale).
  // Gan trong render giong TiptapEditor cu — can disable rule react-hooks/refs.
  /* eslint-disable react-hooks/refs */
  const valueRef = useRef(value);
  valueRef.current = value;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  /* eslint-enable react-hooks/refs */
  // Co chan loop khi ta chu dong setData (khong phai user go).
  const isSettingData = useRef(false);

  // Config tao 1 lan; onUploadError on dinh theo doi tuong props nen khong rebuild.
  const [config] = useState<EditorConfig>(() =>
    buildConfig(onUploadError, wikiId),
  );

  // Dong bo value (ngoai) -> editor khi khac noi dung tab hien tai.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const current = editor.getData();
    const next = value[activeTab];
    if (current !== next) {
      isSettingData.current = true;
      editor.setData(next);
      isSettingData.current = false;
    }
  }, [value, activeTab]);

  const handleChange = (_evt: unknown, editor: Editor) => {
    if (isSettingData.current) return;
    const md = editor.getData();
    const tab = activeTabRef.current;
    if (md !== valueRef.current[tab]) {
      onChange({ ...valueRef.current, [tab]: md });
    }
  };

  const switchTab = (next: "en" | "vi") => {
    const editor = editorRef.current;
    if (!editor || next === activeTab) return;
    const currentMd = editor.getData();
    if (currentMd !== valueRef.current[activeTab]) {
      onChange({ ...valueRef.current, [activeTab]: currentMd });
    }
    setInternalTab(next);
    isSettingData.current = true;
    editor.setData(valueRef.current[next]);
    isSettingData.current = false;
  };

  const copyFromOther = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const other = activeTab === "en" ? "vi" : "en";
    const otherMd = valueRef.current[other];
    onChange({ ...valueRef.current, [activeTab]: otherMd });
    isSettingData.current = true;
    editor.setData(otherMd);
    isSettingData.current = false;
  };

  return (
    <div className="wiki-ck-editor rounded-md border bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-2">
        {hideLocaleTabs ? (
          <span />
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => switchTab(v as "en" | "vi")}
            className="w-auto"
          >
            <TabsList className="h-9 bg-transparent">
              <TabsTrigger value="en">{t("wiki.tab_en")}</TabsTrigger>
              <TabsTrigger value="vi">{t("wiki.tab_vi")}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyFromOther}
          title="Copy content from the other language"
        >
          {activeTab === "en" ? t("wiki.copy_from_vi") : t("wiki.copy_from_en")}
        </Button>
      </div>
      <div className="prose prose-slate dark:prose-invert max-w-none [&_.ck-editor__editable]:min-h-[280px] [&_.ck-editor__editable]:px-4 [&_.ck-editor__editable]:py-3">
        <CKEditor
          editor={ClassicEditor}
          config={config}
          data={value[activeTab]}
          disabled={readonly}
          onReady={(editor) => {
            editorRef.current = editor;
            // Markdown khong bieu dien duoc size anh — giu <figure>/<img> duoi dang
            // raw HTML khi serialize de width tu resize song qua luu/reload.
            const proc = editor.data.processor as {
              keepHtml?: (el: string) => void;
            };
            proc.keepHtml?.("figure");
            proc.keepHtml?.("img");
          }}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
