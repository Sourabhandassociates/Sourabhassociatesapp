import { useEffect, useRef } from "react";

/**
 * Facts & Arguments case sections (2026-08-18). A minimal, dependency-free
 * rich-text editor — this app has no existing rich-text needs and deliberately
 * carries a lean dependency set (no UI framework, no editor library), so a
 * small `contentEditable` + `document.execCommand` toolbar covering exactly
 * the requested formatting (headings, bold, italic, underline, bullet/numbered
 * lists, paragraphs) was preferred over adding a new npm package for two text
 * fields. `execCommand` is deprecated but remains fully functional in every
 * browser this internal tool targets for these specific commands.
 *
 * Uncontrolled by design: `initialHtml` seeds the editable region once at
 * mount (edit sessions are short-lived — the section is re-mounted fresh each
 * time "Edit" is pressed, via React `key`), and `onChange` fires the live HTML
 * on every input so the parent can read it out on Save without re-rendering
 * this component on every keystroke (which would fight the browser's own
 * cursor/selection state inside a contentEditable region).
 *
 * The HTML this produces is untrusted until the backend re-sanitizes it on
 * save (utils/richText.ts) — this component does not attempt to be the
 * security boundary itself.
 */
interface RichTextEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const TOOLBAR_BUTTONS: { command: string; value?: string; label: string; title: string }[] = [
  { command: "formatBlock", value: "H1", label: "H1", title: "Heading 1" },
  { command: "formatBlock", value: "H2", label: "H2", title: "Heading 2" },
  { command: "formatBlock", value: "H3", label: "H3", title: "Heading 3" },
  { command: "formatBlock", value: "P", label: "¶", title: "Paragraph" },
  { command: "bold", label: "B", title: "Bold" },
  { command: "italic", label: "I", title: "Italic" },
  { command: "underline", label: "U", title: "Underline" },
  { command: "insertUnorderedList", label: "• List", title: "Bullet list" },
  { command: "insertOrderedList", label: "1. List", title: "Numbered list" },
];

export function RichTextEditor({ initialHtml, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
    }
    // Intentionally runs once at mount only — this is an uncontrolled region.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleInput() {
    onChange(editorRef.current?.innerHTML ?? "");
  }

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLBAR_BUTTONS.map((btn) => (
          <button
            key={btn.title}
            type="button"
            title={btn.title}
            // Prevents the button from stealing focus/selection away from the
            // contentEditable region before execCommand runs against it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand(btn.command, btn.value)}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="rich-text-content rich-text-editable"
        contentEditable
        onInput={handleInput}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  );
}
