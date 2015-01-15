"use strict";

/**
 * Router tests
 */

var koa = require("koa");
var Router = require("../../lib/router");
var methods = require("methods");
var request = require("supertest");
var should = require("should");


function doneIfError(done) {

  return function (err) {

    if (err) {
      return done(err);
    }
  };
}


function sleep(time) {
  var defer = Promise.defer();
  setTimeout(function () {

    defer.resolve(time);
  }, time);

  return defer.promise;
}


describe("router/lib/router", function () {

  it("should expose middleware factory", function () {

    var router = new Router();
    router.should.have.property("middleware");
    router.middleware.should.be.type("function");

    var middleware = router.middleware();
    should.exist(middleware);
    middleware.should.be.type("function");
  });

  it("should expose methods into koa app", function () {

    var app = koa();
    app.use(Router(app));

    methods.concat(["use", "register", "all", "redirect"])
    .forEach(function (method) {

      app.should.have.property(method);
      app[method].should.be.type("function");
    });
  });

  it("should match corresponding requests", function (done) {

    var app = koa();
    app.use(Router(app));
    app.get("/:category/:title", function *(next) {

      this.should.have.property("params");
      this.params.should.have.property("category", "programming");
      this.params.should.have.property("title", "how-to-node");
      this.status = 204;
    });

    app.post("/:category", function *(next) {

      this.should.have.property("params");
      this.params.should.have.property("category", "programming");
      this.status = 204;
    });

    app.put("/:category/not-a-title", function *(next) {

      this.should.have.property("params");
      this.params.should.have.property("category", "programming");
      this.params.should.not.have.property("title");
      this.status = 204;
    });

    var client = request(app.listen());
    client.get("/programming/how-to-node").expect(204, doneIfError(done));
    client.post("/programming").expect(204, doneIfError(done));
    client.put("/programming").expect(405, doneIfError(done));
    client.put("/programming/not-a-title").expect(204, done);
  });

  it("should execute route middleware using `app.context`", function (done) {

    var app = koa();
    app.use(Router(app));
    app.get("/:category/:title", function *(next) {

      this.should.have.property("app");
      this.should.have.property("req");
      this.should.have.property("res");
      this.status = 204;
      done();
    });

    request(app.listen())
      .get("/match/this")
      .expect(204, doneIfError(done));
  });

  it("should not match after ctx.throw()", function (done) {

    var app = koa();
    app.env = "test";
    app.use(Router(app));
    var counter = 0;

    app.get("/", function *(next) {

      counter++;
      this.throw(403);
    }, function *(next) {

      counter++;
    });

    request(app.listen())
    .get("/")
    .expect(403)
    .end(function (err) {

      if (err) {
        return done(err);
      }

      counter.should.equal(1);
      done();
    });
  });

  it("should support generators for route middleware", function (done) {

    var app = koa();
    app.use(Router(app));
    var duration = NaN;
    var sleepTime = Infinity;
    app.get("/", function *(next) {

      var start = Date.now();
      sleepTime = yield sleep(500);
      duration = Date.now() - start;
      this.status = 204;
      return yield *next;
    });

    app.use(function *() {
      sleepTime.should.not.NaN;
      duration.should.not.below(sleepTime);
      done();
    });

    request(app.listen())
    .get("/")
    .expect(204, doneIfError(done));
  });

  it("should respond to OPTIONS requests", function (done) {

    var app = koa();
    app.use(Router(app));
    app.get("/user", function *() { });
    app.post("/user", function *() { });

    request(app.listen())
    .options("/user")
    .expect(204)
    .end(function (err, res) {

      if (err) {
        return done(err);
      }

      res.header.should.have.property("allow", "GET, POST");
      done();
    });
  });

  it("should respond with 501 Not Implemented", function (done) {

    var app = koa();
    app.use(Router(app));
    app.get("/user", function *() { });
    app.post("/user", function *() { });

    request(app.listen())
    .del("/user")
    .expect(501, done);
  });

  it("should restore ctxt.path and ctx.params when exit routing", function (done) {

    var app = koa();
    var counter = 0;
    app.use(function *(next) {

      this.path.should.equal("/users/abc");
      yield *next;
      this.path.should.equal("/users/abc");
      counter++;
    });

    var router = new Router(app);
    app.use(router.middleware())
    .mount("/:category", function *(next) {

      this.path.should.equal("/abc");
      should.exist(this.params);
      this.params.should.have.property("category", "users");
      this.params.should.not.have.property("id");
      var params = this.params;
      yield *next;
      this.path.should.equal("/abc");
      should.exist(this.params);
      this.params.should.equal(params);
      this.params.should.have.property("category", "users");
      this.params.should.not.have.property("id");
      counter++;
    });

    router.get("/users/:id", function *(next) {
      this.path.should.equal("/");
      should.exist(this.params);
      this.params.should.not.have.property("category");
      this.params.should.have.property("id", "abc");
      var params = this.params;
      this.status = 204;
      yield *next;
      this.path.should.equal("/");
      should.exist(this.params);
      this.params.should.equal(params);
      this.params.should.not.have.property("category");
      this.params.should.have.property("id", "abc");
      counter++;
    });

    request(app.listen())
    .get("/users/abc")
    .expect(204, function (err) {

      if (err) {
        return done(err);
      }
      counter.should.equal(3);
      done();
    });
  });

  describe("Router#[verb]()", function () {

    it("should register route specific to HTTP verb", function () {

      var app = koa();
      var router = new Router(app);
      app.use(router.middleware());
      methods.forEach(function (method) {

        app.should.have.property(method);
        app[method].should.be.type("function");
        app[method]("/", function *() {});
      });

      router.routes.should.have.length(methods.length);
    });

    it("should enable route chaining", function () {

      var router = new Router();
      methods.forEach(function (method) {
        router[method]("/", function *() {}).should.equal(router);
      });
    });
  });

  describe("Router#all()", function () {

    it("should register route for all HTTP verbs", function () {

      var app = koa();
      var router = new Router(app);
      app.all("/", function *(next) {

        this.status = 204;
      });

      app.use(router.middleware());
      router.should.have.property("routes");
      router.routes.should.have.property("length", 1);
      router.routes[0].should.have.property("path", "/");
      router.routes[0].should.have.property("methods");
      should.deepEqual(router.routes[0].methods, methods.map(function (method) {
        return method.toUpperCase();
      }));
    });
  });

  describe("Router#mount()", function () {

    it("should be as prefix for routing", function (done) {

      var app = koa();
      var counter = 0;
      var router = new Router(app);
      app.use(router.middleware());

      router.mount("/first", function *(next) {
        yield *next;
        counter++;
      });

      router.mount("/first/:id", [
        function *(next) {

          yield *next;
          counter++;
        },

        function *(next) {
          yield *next;
          counter++;
        }
      ], function *(next) {

        yield *next;
        counter++;
      });

      router.mount("/first/second/third", function *(next) {
        this.status = 204;
        yield *next;
        counter++;
      });

      request(app.listen())
      .get("/first/second/third")
      .expect(204, function (err) {

        if (err) {
          return done(err);
        }

        counter.should.equal(5);
        counter = 0;
        request(app.listen())
        .get("/first/sec")
        .expect(501, function (err) {

          if (err) {
            return done(err);
          }

          counter.should.equal(4);
          done();
        });
      });
    });

    it("can mount koa instance", function (done) {

      var app = koa();
      var a = koa();

      a.use(function *(next) {

        this.path.should.equal("/");
        should.exist(this.params);
        this.params.should.have.property("id", "world");
        this.status = 204;
      });

      app.use(Router(app))
      .mount("/hello/:id", a);

      request(app.listen())
      .get("/hello/world")
      .expect(204, done);
    });
  });

  describe("Router#register()", function () {

    it("should register new routes", function () {

      var router = new Router();
      router.should.have.property("register");
      router.register.should.be.type("function");

      var route = router.register("/", ["GET", "POST"], function *() {});
      router.routes.should.be.an.instanceOf(Array);
      router.routes.should.have.property("length", 1);
      router.routes[0].should.have.property("path", "/");
    });
  });

  describe("Router#redirect()", function () {

    it("should register redirect routes", function (done) {

      var app = koa();
      var router = new Router(app);
      router.should.have.property("redirect");
      router.redirect.should.be.type("function");
      router.redirect("/source", "/destination", 302);
      app.use(router.middleware());
      router.routes.should.have.property("length", 1);
      router.routes[0].should.have.property("path", "/source");

      request(app.listen())
      .get("/source")
      .expect(302, function (err, res) {

        if (err) {
          return done(err);
        }

        res.header.should.have.property("location", "/destination");
        done();
      });
    });

    it("should redirect using route names", function (done) {

      var app = koa();
      var router = new Router(app);
      app.use(router.middleware());
      app.get("home", "/", function *() {});
      app.get("sign-up-form", "/sign-up-form", function *() {});
      app.redirect("home", "sign-up-form");

      request(app.listen())
      .post("/")
      .expect(301, function (err, res) {

        if (err) {
          return done(err);
        }

        res.header.should.have.property("location", "/sign-up-form");
        done();
      });
    });
  });

  describe("Router#url()", function () {

    it("should generate URL for given route", function () {

      var app = koa();
      app.use(Router(app));
      app.get("books", "/:category/:title", function *(next) {

        this.status = 204;
      });

      var url = app.url("books", {
        category: "programming",
        title: "how to node"
      });
      url.should.equal("/programming/how%20to%20node");

      url = app.url("books", "programming", "how to node");
      url.should.equal("/programming/how%20to%20node");
    });

    it("should return error for unnamed routes", function () {

      var app = koa();
      app.use(Router(app));
      app.get("/:category/:title", function *(next) {

        this.status = 204;
      });

      app.url("books", {
        category: "programming",
        title: "how to node"
      }).should.be.an.instanceOf(Error);
    });
  });

  describe("Router#param()", function () {

    it("should run parameter middleware", function (done) {

      var app = koa();
      app.use(Router(app))
      .param("user", function *(id, next) {
        this.state.user = {
          name: "alex",
          id: id
        };

        if (!id) {
          this.status = 404;
          return;
        }
        yield *next;
      })
      .get("/users/:user", function *(next) {
        this.body = this.state.user;
      });

      request(app.listen())
      .get("/users/3")
      .expect(200)
      .end(function (err, res) {

        if (err) {
          return done(err);
        }

        res.should.have.property("body");
        res.body.should.have.property("name", "alex");
        res.body.should.have.property("id", "3");
        done();
      });
    });

    it("should run parameter middleware in order of URL appearance", function (done) {

      var app = koa();
      var orders = [];

      app.use(Router(app))
      .param("user", function *(id, next) {

        this.state.user = {
          name: "alex",
          id: id
        };

        if (!id) {
          this.status = 404;
          return;
        }

        orders.push(2);
        yield *next;
      })
      .param("first", function *(id, next) {

        should.not.exist(this.state.user);
        if (!id) {
          this.status = 404;
          return;
        }

        orders.push(1);
        yield *next;
      })
      .get("/:first/users/:user", function *(next) {

        should.exist(this.state.user);
        should.not.exist(this.state.user.orders);

        orders.push(3);

        this.state.user.orders = orders.reduce(function (str, order) {
          return str + order;
        }, "");
        this.body = this.state.user;
      });

      request(app.listen())
      .get("/id1/users/id2")
      .expect(200)
      .end(function (err, res) {

        if (err) {
          return done(err);
        }

        res.should.have.property("body");
        res.body.should.have.property("id", "id2");
        res.body.should.have.property("name", "alex");
        res.body.should.have.property("orders", "123");
        should.deepEqual(orders, [1, 2, 3]);
        done();
      });
    });
  });

  describe("Router#opts", function () {

    it("should respond with 200", function (done) {

      var app = koa();
      app.use(Router(app, {
        strict: true
      }))
      .get("/info", function *() {
        this.body = "hello";
      });

      request(app.listen())
      .get("/info")
      .expect(200, function (err, res) {

        if (err) {
          return done(err);
        }

        res.text.should.equal("hello");
        done();
      });
    });

    it("should respond with 404 when has a trailing slash", function (done) {

      var app = koa();
      var router = new Router(app, {
        strict: true
      });

      app.use(router.middleware())
      .get("/info", function *() {
        this.body = "hello";
      });

      router.mount("/info2/", function *() {
        this.body = "hello2";
      });

      request(app.listen())
      .get("/info/")
      .expect(404, doneIfError(done));

      request(app.listen())
      .get("/info2")
      .expect(404, doneIfError(done));

      request(app.listen())
      .get("/info2/abc")
      .expect(200)
      .expect("hello2", done);
    });
  });

  describe("If no HEAD method, default to GET", function () {

    it("should default to GET", function (done) {

      var app = koa();
      var router = new Router(app);
      app.use(router.middleware());

      app.get("/users/:id", function *() {

        should.exist(this.params.id);
        this.body = "hello";
      });

      request(app.listen())
      .head("/users/1")
      .expect(200, function (err, res) {

        if (err) {
          return done(err);
        }

        res.body.should.be.empty;
        done();
      });
    });
  });
});