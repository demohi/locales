'use strict';

const debug = require('debug')('koa-locales');
const util = require('util');
const path = require('path');
const ms = require('humanize-ms');
const assign = require('object-assign');

const DEFAULT_OPTIONS = {
  defaultLocale: 'en_US',
  queryField: 'locale',
  cookieField: 'locale',
  localeAlias: {},
  cookieMaxAge: '1y',
  dir: undefined,
  dirs: [ path.join(process.cwd(), 'locales') ],
  functionName: '__',
};

module.exports = function (app, options) {
  options = assign({}, DEFAULT_OPTIONS, options);
  const defaultLocale = options.defaultLocale;
  const queryField = options.queryField;
  const cookieField = options.cookieField;
  const localeAlias = options.localeAlias;
  const cookieMaxAge = ms(options.cookieMaxAge);
  const functionName = options.functionName;

  app.context[functionName] = function (key, value) {
    if (arguments.length === 0) {
      // __()
      return '';
    }

    const locale = this.__getLocale();
    const resource = this.__resource || {};

    let text = resource[key];
    if (text === undefined) {
      text = key;
    }

    debug('%s: %j => %j', locale, key, text);
    if (!text) {
      return '';
    }

    if (arguments.length === 1) {
      // __(key)
      return text;
    }
    if (arguments.length === 2) {
      if (isObject(value)) {
        // __(key, object)
        // __('{a} {b} {b} {a}', {a: 'foo', b: 'bar'})
        // =>
        // foo bar bar foo
        return formatWithObject(text, value);
      }

      if (Array.isArray(value)) {
        // __(key, array)
        // __('{0} {1} {1} {0}', ['foo', 'bar'])
        // =>
        // foo bar bar foo
        return formatWithArray(text, value);
      }

      // __(key, value)
      return util.format(text, value);
    }

    // __(key, value1, ...)
    const args = new Array(arguments.length);
    args[0] = text;
    for(let i = 1; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return util.format.apply(util, args);
  };

  // 1. query: /?locale=en-US
  // 2. cookie: locale=zh-TW
  // 3. header: Accept-Language: zh-CN,zh;q=0.5
  app.context.__getLocale = function () {
    if (this.__locale) {
      return this.__locale;
    }
    if (typeof this.getHeader !== 'function') {
      return defaultLocale;
    }
    const cookieLocale = this.cookies.get(cookieField, { signed: false });
    let locale = this.query[queryField] || cookieLocale;
    if (!locale) {
      // Accept-Language: zh-CN,zh;q=0.5
      // Accept-Language: zh-CN
      let languages = this.acceptsLanguages();
      if (languages) {
        if (Array.isArray(languages)) {
          if (languages[0] === '*') {
            languages = languages.slice(1);
          }
          if (languages.length > 0) {
            locale = languages[0];
          }
        } else {
          locale = languages;
        }
      }
      // all missing, set it to defaultLocale
      if (!locale) {
        locale = defaultLocale;
      }
    }

    // cookie alias
    if (locale in localeAlias) locale = localeAlias[locale];
    // if header not send, set the locale cookie
    if (cookieLocale !== locale && !this.headerSent) {
      // locale change, need to set cookie
      this.cookies.set(cookieField, locale, {
        // make sure brower javascript can read the cookie
        httpOnly: false,
        maxAge: cookieMaxAge,
        signed: false,
      });
    }
    this.__locale = locale;
    return locale;
  };

  app.context.__setResource = function(resource) {
    this.__resource = resource;
  };
};

function isObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]';
}

const ARRAY_INDEX_RE = /\{(\d+)\}/g;
function formatWithArray(text, values) {
  return text.replace(ARRAY_INDEX_RE, function (orignal, matched) {
    const index = parseInt(matched);
    if (index < values.length) {
      return values[index];
    }
    // not match index, return orignal text
    return orignal;
  });
}

const Object_INDEX_RE = /\{(.+?)\}/g;
function formatWithObject(text, values) {
  return text.replace(Object_INDEX_RE, function (orignal, matched) {
    const value = values[matched];
    if (typeof value !== 'boolean' && (!!value || value === 0 || value === '')) {
      return value;
    }
    // not match index, return orignal text
    return orignal;
  });
}
