export function transformerFileName() {
  return {
    name: 'filename',
    pre(node) {
      const raw = this.options.meta?.__raw ?? '';
      const m = raw.match(/title="([^"]+)"/);
      if (m) node.properties['data-title'] = m[1];
      if (this.options.lang === 'mermaid') node.properties['data-language'] = 'mermaid';
    },
  };
}
