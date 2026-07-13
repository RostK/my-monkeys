/* Minimal, dependency-free markdown → HTML for the mock artifact bodies.
 * Handles headings, fenced code, inline code, bold, lists and paragraphs.
 * Input is trusted (generated in data.js), but everything is HTML-escaped anyway.
 */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function inline(t) {
  t = esc(t);
  t = t.replace(/`([^`]+)`/g, (_, c) => "<code>" + c + "</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return t;
}

export function renderMarkdown(md) {
  const lines = md.split("\n");
  let html = "";
  let i = 0;
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      closeList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      html += "<pre><code>" + esc(buf.join("\n")) + "</code></pre>";
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const n = h[1].length;
      html += "<h" + n + ">" + inline(h[2]) + "</h" + n + ">";
      i++;
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += "<li>" + inline(line.replace(/^\s*-\s+/, "")) + "</li>";
      i++;
      continue;
    }
    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }
    closeList();
    html += "<p>" + inline(line) + "</p>";
    i++;
  }
  closeList();
  return html;
}
