// Gera ColheitaSombria.rbxlx (abre direto no Roblox Studio) a partir da pasta src/,
// seguindo as mesmas regras do Rojo:
//   *.server.luau -> Script | *.client.luau -> LocalScript | *.luau -> ModuleScript | pasta -> Folder
// Também gera sourcemap.json (usado pelo luau-lsp para checar os tipos).
//
// Uso: node build-place.mjs

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const project = JSON.parse(readFileSync(join(root, "default.project.json"), "utf8"));

function scriptInfo(file) {
  if (file.endsWith(".server.luau")) return { cls: "Script", name: file.slice(0, -".server.luau".length) };
  if (file.endsWith(".client.luau")) return { cls: "LocalScript", name: file.slice(0, -".client.luau".length) };
  if (file.endsWith(".luau")) return { cls: "ModuleScript", name: file.slice(0, -".luau".length) };
  return null;
}

// Converte uma pasta em uma árvore de instâncias
function fromPath(name, path) {
  const node = { name, className: "Folder", children: [] };
  for (const entry of readdirSync(path).sort()) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) {
      node.children.push(fromPath(entry, full));
    } else {
      const info = scriptInfo(entry);
      if (info) {
        node.children.push({
          name: info.name,
          className: info.cls,
          source: readFileSync(full, "utf8"),
          filePaths: [relative(root, full)],
          children: [],
        });
      }
    }
  }
  return node;
}

function fromTree(name, tree) {
  if (tree.$path) return fromPath(name, join(root, tree.$path));
  const node = { name, className: tree.$className || name, children: [] };
  for (const [key, value] of Object.entries(tree)) {
    if (!key.startsWith("$")) node.children.push(fromTree(key, value));
  }
  return node;
}

const dataModel = fromTree(project.name, project.tree);
dataModel.className = "DataModel";

// ---------- rbxlx ----------
let ref = 0;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cdata = (s) => "<![CDATA[" + s.split("]]>").join("]]]]><![CDATA[>") + "]]>";

function item(node, indent) {
  const pad = "\t".repeat(indent);
  let out = `${pad}<Item class="${node.className}" referent="RBX${ref++}">\n`;
  out += `${pad}\t<Properties>\n`;
  out += `${pad}\t\t<string name="Name">${esc(node.name)}</string>\n`;
  if (node.source !== undefined) {
    out += `${pad}\t\t<ProtectedString name="Source">${cdata(node.source)}</ProtectedString>\n`;
  }
  out += `${pad}\t</Properties>\n`;
  for (const child of node.children) out += item(child, indent + 1);
  out += `${pad}</Item>\n`;
  return out;
}

let xml = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n`;
xml += "\t<External>null</External>\n\t<External>nil</External>\n";
for (const service of dataModel.children) xml += item(service, 1);
xml += "</roblox>\n";
writeFileSync(join(root, "ColheitaSombria.rbxlx"), xml);

// ---------- sourcemap ----------
function sm(node) {
  const out = { name: node.name, className: node.className };
  if (node.filePaths) out.filePaths = node.filePaths;
  if (node.children.length) out.children = node.children.map(sm);
  return out;
}
writeFileSync(join(root, "sourcemap.json"), JSON.stringify(sm(dataModel), null, 2));

let count = 0;
(function walk(n) { if (n.source !== undefined) count++; n.children.forEach(walk); })(dataModel);
console.log(`ColheitaSombria.rbxlx gerado com ${count} scripts.`);
