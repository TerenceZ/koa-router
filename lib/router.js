"use strict";

/**
 * Dependencies
 */

var debug = require("debuglog")("siren/router");
var methods = require("methods");
var statuses = require("statuses");
var Route = require("./route");

/**
 * Expose `Router`
 */

module.exports = Router;

/**
 * Initialize Router.
 *
 * @param {Application=} app Optional. Extends app with methods such
 * as `app.get()`, `app.post()`, etc.
 * @param {Object=} opts Optional. Passed to `path-to-regexp`.
 * @return {Router}
 * @api public
 */

function Router(app, opts) {

  if (!(this instanceof Router)) {
    var router = new Router(app, opts);
    return router.middleware();
  }

  if (app && !app.use) {
    opts = app;
    app = undefined;
  }

  this.opts = opts || {};
  this.methods = ["OPTIONS"];
  this.routes = [];
  this.params = {};

  if (app) {
    this.extendApp(app);
  }
}

/**
 * Router prototype
 */

var router = Router.prototype;

/**
 * Used to check if a instance is a router.
 */
router.__isRouter = true;

/**
 * Router middleware factory. Returns router middleware which dispatches route
 * middleware corresponding to the request.
 *
 * @param {Function} next
 * @return {Function}
 * @api public
 */

router.middleware = function () {

  var router = this;
  return function *(done) {

    var pathname = this.path;
    debug("routing %s %s", this.method, pathname);

    // Find routes matching requested path.
    var routes = router.match(pathname);
    if (!routes) {
      return yield *done;
    }

    var methodsAvailable = {};
    var context = this;
    var method = this.method;
    var params = this.params;
    var index = -1;
    var called = false;

    function *next() {

      // Save the previous context.
      var prevParams = context.params;
      var prevPathname = context.path;

      if (++index >= routes.length) {
        context.path = pathname;
        context.params = params;

        yield *done;

        // We only set the status when no actual middleware has handled it.
        if (!called && !context.response._explicitStatus) {

          // If we set the status using `ctx.status`, it will make the `ctx.response._explicitStatus` true,
          // which means if we writes `ctx.body` in upstream, it will not auto modify the `ctx.status`.
          // So here we just write the status in the `ctx.res.statusCode` directly.
          context.res.statusCode = (context.method === "OPTIONS" ? 204 : 405);
          context.set("Allow", Object.keys(methodsAvailable).join(", ")); 

          if (!~router.methods.indexOf(context.method)) {
            context.res.statusCode = 501;
          }

          context.res.statusMessage = statuses[context.res.statusCode];
        }

        // Restore the context.
        context.params = prevParams;
        context.path = prevPathname;
        return;
      }

      // Check if we should handle the middleware.
      var route = routes[index].route;
      var shouldCallMiddleware = route.methods.indexOf(method) >= 0 || route.asPrefix;

      // If there is no middleware to handle the OPTIONS request,
      // we record the available methods for setting allow header later if neccessary.
      if (!shouldCallMiddleware && method === "OPTIONS") {
        for (var i = -1, l = route.methods.length; ++i < l;) {
          methodsAvailable[route.methods[i]] = true;
        }
      }

      // If the method matched, or not matched but it is a HEAD request and the route
      // can handle GET request, we call the middleware.
      if (shouldCallMiddleware || 
        (method === "HEAD" && route.methods.indexOf("GET") >= 0)) {

        called = true;

        // Replace the context with the route context.
        context.path = routes[index].path;
        context.params = router.opts.mergeParams ? 
          mergeParams(params, routes[index].params) :
          routes[index].params;

        yield *route.middleware.call(context, next());

        // Restore the context.
        context.params = prevParams;
        context.path = prevPathname;
        return;
      }

      // If this route isn't matched, step forward to next one.
      yield *next();
    }

    // Start to find the matched middleware.
    yield *next();
  };
};

/**
 * Create `router.verb()` methods, where *verb* is one of the HTTP verbes such
 * as `router.get()` or `router.post()`.
 */

methods.forEach(function (method) {

  router[method] = function (name, path, middleware) {

    var args = Array.prototype.slice.call(arguments);
    if ((typeof path === "string") || (path instanceof RegExp)) {
      args.splice(2, 0, [method]);
    } else {
      args.splice(1, 0, [method]);
    }

    this.register.apply(this, args);
    return this;
  };

  router[method].displayName = method;
});


/**
 * Register route with all methods.
 *
 * @param {String} name Optional.
 * @param {String|RegExp} path
 * @param {Function} middleware You may also pass multiple middleware.
 * @return {Router}
 * @api public
 */

router.all = function all(name, path, middleware) {

  var args = Array.prototype.slice.call(arguments);
  args.splice(typeof path === "function" ? 1 : 2, 0, methods);

  this.register.apply(this, args);
  return this;
};

/**
 * Mount route with a given name and path.
 *
 * @param {String} name Optional.
 * @param {String|RegExp} path
 * @param {Function|Application} middleware You may also pass multiple middleware.
 * @return {Router}
 * @api public
 */

router.mount = function mount(name, path, middleware) {

  var offset = 2;
  if (typeof path !== "string" && !(path instanceof RegExp)) {
    offset = 1;
    path = name;
    name = undefined;
  }

  // Create a route.
  var route = new Route(path, null, Array.prototype.slice.call(arguments, offset), name, this.opts);

  // Compose with the parameter middleware.
  Object.keys(this.params).forEach(function (param) {

    route.param(param, this.params[param]);
  }, this);

  this.routes.push(route);

  return this;
};

router.use = router.mount;

/**
 * Redirect `path` to `destination` URL with optional 30x status `code`.
 *
 * @param {String} source URL, RegExp, or route name.
 * @param {String} destination URL or route name.
 * @param {Number} code HTTP status code (default: 301).
 * @return {Router}
 * @api public
 */

router.redirect = function redirect(source, destination, code) {

  // Lookup source by name.
  if (source instanceof RegExp || source[0] !== "/") {
    source = this.url(source);
  }

  // Lookup destination by name.
  if (destination instanceof RegExp || destination[0] !== "/") {
    destination = this.url(destination);
  }

  return this.all(source, function *redirect() {

    this.redirect(destination);
    this.status = code || 301;
  });
};

/**
 * Create and register a route.
 *
 * @param {String} name Optional.
 * @param {String|RegExp} path Path string or regular expression.
 * @param {Array} methods Array of HTTP verbs.
 * @param {Function} middleware Multiple middleware also accepted.
 * @return {Router}
 * @api public
 */

router.register = function register(name, path, methods, middleware) {

  if (Array.isArray(path)) {
    middleware = Array.prototype.slice.call(arguments, 2);
    methods = path;
    path = name;
    name = undefined;
  } else {
    middleware = Array.prototype.slice.call(arguments, 3);
  }

  // Create a route.
  var route = new Route(path, methods, middleware, name, this.opts);

  // Compose with the parameter middleware.
  Object.keys(this.params).forEach(function (param) {

    route.param(param, this.params[param]);
  }, this);

  this.routes.push(route);

  // Register route methods with router (for 501 responses).
  route.methods.forEach(function (method) {

    if (this.methods.indexOf(method) < 0) {
      this.methods.push(method);
    }
  }, this);

  return route;
};

/**
 * Lookup route with given `name`.
 *
 * @param {String} name
 * @return {Router?}
 * @api public
 */

router.route = function route(name) {

  for (var i = -1, l = this.routes.length; ++i < l;) {
    if (this.routes[i].name === name) {
      return this.routes[i];
    }
  }

  return null;
};

/**
 * Generate URL for route using given `params`.
 *
 * @param {String} name route name
 * @param {Object} params url parameters
 * @return {String|Error}
 * @api public
 */

router.url = function url(name, params) {

  var route = this.route(name);
  if (route) {
    var args = Array.prototype.slice.call(arguments, 1);
    return route.url.apply(route, args);
  }

  return new Error("No route found for name: " + name);
};

/**
 * Register parameter middleware.
 *
 * @param {String} param
 * @param {Function} parameter middleware
 * @return {Router}
 * @api public
 */

router.param = function param(param, fn) {

  this.params[param] = fn;
  this.routes.forEach(function (route) {

    route.param(param, fn);
  });

  return this;
};

/**
 * Match given `path` and return corresponding routes.
 *
 * @param {String} path
 * @param {Array} params populated with captured url parameters
 * @return {Array?} Returns matched routes
 * @api private
 */

router.match = function (pathname) {

  var routes = this.routes;
  var matchedRoutes = [];

  debug("matching %s", pathname);
  for (var i = -1, l = routes.length; ++i < l;) {
    debug("test %s %s", routes[i].path, routes[i].regexp);

    var matched = routes[i].match(pathname);
    if (matched) {
      debug("match %s %s", routes[i].path, routes[i].regexp);

      matched.route = routes[i];
      matchedRoutes.push(matched);
    }
  }

  return matchedRoutes.length > 0 ? matchedRoutes : null;
};

/**
 * Extend given `app` with router methods.
 *
 * @param {Application} app
 * @return {Application}
 * @api private
 */

router.extendApp = function extendApp(app) {

  var router = this;
  app.url = router.url.bind(router);
  app.router = router;

  ["all", "redirect", "register", "param", "mount", "use"]
  .concat(methods)
  .forEach(function (method) {

    app[method] = function () {

      router[method].apply(router, arguments);
      return this;
    };
  });

  return app;
};


/**
 * Merge `b` and `a` into a new object.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object}
 * @api private
 */

function mergeParams(a, b) {

  if (!b) {
    return a;
  }

  var c = [];
  for (var prop in a) {
    c[prop] = a[prop];
  }

  for (prop in b) {
    c[prop] = b[prop];
  }

  return c;
}