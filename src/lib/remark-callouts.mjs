import { visit } from 'unist-util-visit';

const ICONS = { tip: '💡', warn: '⚠', note: '✎' };

export function remarkCallouts() {
  return (tree) => {
    visit(tree, 'containerDirective', (node) => {
      const icon = ICONS[node.name];
      if (!icon) return;
      node.data = {
        hName: 'div',
        hProperties: { className: ['callout', `callout-${node.name}`], 'data-icon': icon },
      };
    });
  };
}
