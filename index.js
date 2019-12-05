'use strict';

const fs = require('fs-extra');
const path = require('path');
const stew = require('broccoli-stew');
const mergeTrees = require('broccoli-merge-trees');
const Plugin = require('broccoli-plugin');

class ToElsewherePlugin extends Plugin {
  constructor(_options) {
    const options = _options || {
      encoding: 'utf8'
    };

    super([], {
      annotation: options.annotation || constructor.name,
      persistentOutput: true
    });
  }

  build() {
  }

  writeComponentFile(name, content) {
    fs.ensureFileSync(`${this.outputPath}/templates/components/${name}.hbs`);
    fs.writeFileSync(`${this.outputPath}/templates/components/${name}.hbs`, content)
  }
}

function createTransform(tree) {
  class ComponentTransform {
    constructor({ syntax, moduleName }) {
      this.syntax = syntax;
      this.moduleName = moduleName;
      this.counter = 1;
    }

    generateFileName() {
      const { dir, ext, name } = path.parse(this.moduleName);
      const counter = this.counter++;

      return `${dir}/${name}$${counter}`;
    }

    writeNodeToFile(node) {
      const name = this.generateFileName();
      const content = this.syntax.print(node.program);

      tree.writeComponentFile(name, content);

      return name;
    }

    transformNode(node, componentName) {
      const make = this.syntax.builders;
      const path = node.path;
      const params = [];
      const hash = make.hash([
        node.hash.pairs.find(pair => pair.key === 'named'),
        make.pair('send',
          make.sexpr('component', [ make.literal('StringLiteral', componentName) ])
        )
      ]);
      // TODO validate node, cannot have (send) already set

      return make.mustache(path, params, hash);
    }

    transform(ast) {
      this.syntax.traverse(ast, {
        BlockStatement: node => {
          if (node.path.original === 'to-elsewhere') {
            return this.transformNode(node, this.writeNodeToFile(node));
          }

          return node;
        }
      });

      return ast;
    }
  }

  return ComponentTransform;
}

module.exports = {
  name: require('./package').name,

  treeForApp(tree) {
    return stew.log(mergeTrees([ this._super(tree), this.treeForElseWhere() ].filter(Boolean)));
  },

  treeForElseWhere() {
    if (!this._cachedElseWhereTree) {
      this._cachedElseWhereTree = new ToElsewherePlugin();
    }

    return this._cachedElseWhereTree;
  },

  included() {
    // we have to wrap these in an object so the ember-cli
    // registry doesn't try to call `new` on them (new is actually
    // called within htmlbars when compiling a given template).
    this.app.registry.add('htmlbars-ast-plugin', {
      name: 'some-transform',
      plugin: createTransform(this.treeForElseWhere())
    });
  }
};
