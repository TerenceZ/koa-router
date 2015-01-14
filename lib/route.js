"use strict";

/**
 * Dependencies
 */

var compose = require("koa-compose");
var debug = require("debuglog")("siren/router");
var pathToRegexp = require("path-to-regexp");

/**
 * Expose `Route`.
 */

module.exports = Route;

/**
 * Initialize a new Route with given `method`, `path`, and `middleware`.
 * If the `methods` is an empty array, the `asPrefix` will be true. 
 *
 * @param {String|RegExp} path Path string or regular expression.
 * @param {Array} methods Array of HTTP verbs.
 * @param {Array} middleware Route callback/middleware or series of.
 * @param {String} name Optional.
 * @param {Object=} opts Optional. Passed to `path-to-regexp`.
 * @return {Route}
 * @api private
 */

function Route(path, methods, middleware, name, opts) {

  this.name = name || null;

  this.asPrefix = false;
  this.methods = [];
  if (methods.length) {
    methods.forEach(function (method) {

      this.methods.push(method.toUpperCase());
    }, this);   
  } else {
    this.asPrefix = true;
  }

  this.params = [];
  this.fns = {
    "params": {},
    "middleware": []
  };

  this.opts = opts || {};
  if (path instanceof RegExp) {
    this.path = path.source;
    this.regexp = path;
  } else {
    this.path = path;
    this.regexp = pathToRegexp(path, this.params, {
      "sensitive": this.opts.caseSensitive,
      "strict": this.opts.strict || !this.asPrefix,
      "end": this.asPrefix ? false : true
    });
  }

  // ensure the middleware is function.
  middleware.forEach(function (fn, i) {

    var type = typeof fn;

    // We suppose it is a koa application.
    if (fn && fn.use) {
      middleware[i] = compose(fn.middleware);

    } else if (type !== "function") {
      throw new Error(
        methods.toString() + " `" + (name || path) + "`: `middleware` " +
        "must be a function or application, not `" + type + "`"
      );
    } 
  });

  if (middleware.length > 1) {
    this.middleware = compose(middleware);
  } else {
    this.middleware = middleware[0];
  }

  this.fns.middleware = middleware;

  debug("defined route %s %s", this.methods, this.path);
};

/**
 * Route prototype
 */

var route = Route.prototype;

/**
 * Check if given request `path` matches route,
 * and if so populate `route.params`.
 *
 * @param {String} path
 * @return {Array} of matched params or null if not matched
 * @api private
 */

route.match = function match(path) {

  var matches = path.match(this.regexp);
  if (matches) {
    var captures = matches.length ? matches.slice(1) : [];
    var params = [];

    // If route has parameterized capture groups,
    // use parameter names for properties.
    if (this.params.length) {
      for (var i = -1, l = captures.length; ++i < l;) {
        if (this.params[i]) {
          var c = captures[i];
          params[this.params[i].name] = c ? safeDecodeURIComponent(c) : c;
        }
      }

    } else {
      for (var i = -1, l = captures.length; ++i < l;) {
        var c = captures[i];
        params[i] = c ? safeDecodeURIComponent(c) : c;
      }
    }

    path = path.substr(matches[0].length);
    if (!path.length || path[0] !== "/") {
      path = "/" + path;
    }

    return {
      params: params,
      path: path
    };
  }

  return null;
};

/**
 * Generate URL for route using given `params`.
 *
 * @example
 *
 *   var route = new Route(['GET'], '/users/:id', fn);
 *
 *   route.url({ id: 123 });
 *   // => "/users/123"
 *
 * @param {Object} params url parameters
 * @return {String}
 * @api private
 */

route.url = function url(params) {

  var args = params;
  var url = this.path;

  // Support the (key, value) object form.
  if (typeof params !== "object") {
    args = Array.prototype.slice.call(arguments);
  }

  if (Array.isArray(args)) {
    for (var i = -1, l = args.length; ++i < l;) {
      url = url.replace(/:[^\/]+/, args[i]);
    }

  } else {
    for (var key in args) {
      url = url.replace(":" + key, args[key]);
    }
  }

  return url.split("/").map(function (component) {
    return encodeURIComponent(component);
  }).join("/");
};

/**
 * Run validations on route named parameters.
 *
 * @example
 *
 *   router
 *     .param('user', function *(id, next) {
 *       this.user = users[id];
 *       if (!user) return this.status = 404;
 *       yield next;
 *      })
 *     .get('/users/:user', function *(next) {
 *       this.body = this.user;
 *      });
 *
 * @param {String} param
 * @param {Function *(id, next)} fn
 * @api public
 */

route.param = function param(param, fn) {

  this.fns.params[param] = function *(next) {

    yield *fn.call(this, this.params[param], next);
  };

  var middleware = [];
  this.params.forEach(function (param) {
    var fn = this.fns.params[param.name];
    if (fn) {
      middleware.push(fn);
    }
  }, this);

  this.middleware = compose(middleware.concat(this.fns.middleware));
  return this;
};

/**
 * Safe decodeURIComponent, won't throw any error.
 * If `decodeURIComponent` error happen, just return the original value.
 *
 * @param {String} text
 * @return {String} URL decode original string.
 */

function safeDecodeURIComponent(text) {

  try {
    return decodeURIComponent(text);
  } catch (e) {
    return text;
  }
}
