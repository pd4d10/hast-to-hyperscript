import {html, svg, find, hastToReact} from 'property-information'
import {stringify as spaces} from 'space-separated-tokens'
import {stringify as commas} from 'comma-separated-tokens'
import style from 'style-to-object'
import {webNamespaces as ns} from 'web-namespaces'
import {convert} from 'unist-util-is'

var own = {}.hasOwnProperty

var root = convert('root')
var element = convert('element')
var text = convert('text')

export function toH(h, node, options) {
  var settings = options || {}
  var r = react(h)
  var v = vue(h)
  var vd = vdom(h)
  var prefix

  if (typeof h !== 'function') {
    throw new TypeError('h is not a function')
  }

  if (typeof settings === 'string' || typeof settings === 'boolean') {
    prefix = settings
    settings = {}
  } else {
    prefix = settings.prefix
  }

  if (root(node)) {
    node =
      node.children.length === 1 && element(node.children[0])
        ? node.children[0]
        : {
            type: 'element',
            tagName: 'div',
            properties: {},
            children: node.children
          }
  } else if (!element(node)) {
    throw new Error(
      'Expected root or element, not `' + ((node && node.type) || node) + '`'
    )
  }

  return transform(h, node, {
    schema: settings.space === 'svg' ? svg : html,
    prefix:
      prefix === undefined || prefix === null
        ? r || v || vd
          ? 'h-'
          : null
        : prefix,
    key: 0,
    react: r,
    vue: v,
    vdom: vd,
    hyperscript: hyperscript(h)
  })
}

// Transform a hast node through a hyperscript interface to *anything*!
function transform(h, node, ctx) {
  var parentSchema = ctx.schema
  var schema = parentSchema
  var name = node.tagName
  var attributes = {}
  var nodes = []
  var index = -1
  var key
  var value

  if (parentSchema.space === 'html' && name.toLowerCase() === 'svg') {
    schema = svg
    ctx.schema = schema
  }

  for (key in node.properties) {
    if (own.call(node.properties, key)) {
      addAttribute(attributes, key, node.properties[key], ctx, name)
    }
  }

  if (ctx.vdom) {
    if (schema.space === 'html') {
      name = name.toUpperCase()
    } else {
      attributes.namespace = ns[schema.space]
    }
  }

  if (ctx.prefix) {
    ctx.key++
    attributes.key = ctx.prefix + ctx.key
  }

  if (node.children) {
    while (++index < node.children.length) {
      value = node.children[index]

      if (element(value)) {
        nodes.push(transform(h, value, ctx))
      } else if (text(value)) {
        nodes.push(value.value)
      }
    }
  }

  // Restore parent schema.
  ctx.schema = parentSchema

  // Ensure no React warnings are triggered for void elements having children
  // passed in.
  return nodes.length > 0
    ? h.call(node, name, attributes, nodes)
    : h.call(node, name, attributes)
}

// eslint-disable-next-line complexity, max-params
function addAttribute(props, prop, value, ctx, name) {
  var info = find(ctx.schema, prop)
  var subprop

  // Ignore nullish and `NaN` values.
  // Ignore `false` and falsey known booleans for hyperlike DSLs.
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && Number.isNaN(value)) ||
    (value === false && (ctx.vue || ctx.vdom || ctx.hyperscript)) ||
    (!value && info.boolean && (ctx.vue || ctx.vdom || ctx.hyperscript))
  ) {
    return
  }

  if (value && typeof value === 'object' && 'length' in value) {
    // Accept `array`.
    // Most props are space-separated.
    value = info.commaSeparated ? commas(value) : spaces(value)
  }

  // Treat `true` and truthy known booleans.
  if (info.boolean && ctx.hyperscript) {
    value = ''
  }

  // VDOM, Vue, and React accept `style` as object.
  if (
    info.property === 'style' &&
    typeof value === 'string' &&
    (ctx.react || ctx.vue || ctx.vdom)
  ) {
    value = parseStyle(value, name)
  }

  if (ctx.vue) {
    if (info.property !== 'style') subprop = 'attrs'
  } else if (!info.mustUseProperty) {
    if (ctx.vdom) {
      if (info.property !== 'style') subprop = 'attributes'
    } else if (ctx.hyperscript) {
      subprop = 'attrs'
    }
  }

  if (subprop) {
    if (!props[subprop]) props[subprop] = {}
    props[subprop][info.attribute] = value
  } else if (info.space && ctx.react) {
    props[hastToReact[info.property] || info.property] = value
  } else {
    props[info.attribute] = value
  }
}

// Check if `h` is `react.createElement`.
function react(h) {
  var node = h && h('div')
  return Boolean(
    node &&
      ('_owner' in node || '_store' in node) &&
      (node.key === undefined || node.key === null)
  )
}

// Check if `h` is `hyperscript`.
function hyperscript(h) {
  return Boolean(h && h.context && h.cleanup)
}

// Check if `h` is `virtual-dom/h`.
function vdom(h) {
  return h && h('div').type === 'VirtualNode'
}

function vue(h) {
  var node = h && h('div')
  return Boolean(node && node.context && node.context._isVue)
}

function parseStyle(value, tagName) {
  var result = {}

  try {
    style(value, iterator)
  } catch (error) {
    error.message =
      tagName + '[style]' + error.message.slice('undefined'.length)
    throw error
  }

  return result

  function iterator(name, value) {
    if (name.slice(0, 4) === '-ms-') name = 'ms-' + name.slice(4)
    result[name.replace(/-([a-z])/g, styleReplacer)] = value
  }
}

function styleReplacer($0, $1) {
  return $1.toUpperCase()
}
