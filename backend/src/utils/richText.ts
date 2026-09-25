import sanitizeHtml from "sanitize-html";

/**
 * Facts & Arguments case sections (2026-08-18). These are the first fields in
 * this codebase to store user-authored rich text (every other free-text field —
 * Case.description, CaseNote.content, etc. — is plain text, rendered as-is,
 * never as HTML). Storing/rendering arbitrary HTML without server-side
 * sanitization would be a stored-XSS vector (a staff user could type
 * `<script>`/`<img onerror=...>` into the editor and have it execute for the
 * next person who opens that Case's Facts/Arguments tab) — sanitizing on write
 * (not just relying on the editor's own UI) protects every future consumer of
 * this field, not just the one screen. The allowlist is deliberately just the
 * basic formatting commands the feature spec asks for (headings, bold, italic,
 * underline, bullet/numbered lists, paragraphs) — no links, images, tables, or
 * attributes of any kind (including `style`/`class`), so there is no surface
 * for a `javascript:`-URL or event-handler attack even by omission.
 */
const ALLOWED_TAGS = ["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "ul", "ol", "li", "div"];

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  }).trim();
}
