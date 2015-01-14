"use strict";

/**
 * Route tests
 */

var koa = require("koa");
var Router = require("../../lib/router");
var Route = require("../../lib/route");
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


describe("router/lib/route", function() {
  
  it("should support regular expression route paths", function (done) {

    var app = koa();
    app.use(Router(app))
    .get(/^\/blog\/(\d{4}-\d{2}-\d{2})\/?$/i, function *(next) {

      should.exist(this.params);
      this.params.should.have.property("length", 1);
      this.params.should.have.property("0", "2015-01-14");
      this.status = 204;
    });

    request(app.listen())
    .get("/blog/2015-01-14")
    .expect(204, done);
  });

  it("should support named regular expression routes", function (done) {

    var app = koa();
    app.use(Router(app))
    .get("test", /^\/test\/?/i, function *(next) {

      this.status = 204;
      yield *next;
    });

    request(app.listen())
    .get("/test")
    .expect(204, done);
  });

  it("should compose multiple callbacks/middleware", function (done) {

    var app = koa();
    app.use(Router(app))
    .get("/:category/:title", function *(next) {

      this.status = 500;
      yield *next;    
    }, function *(next) {

      this.status.should.equal(500);
      this.status = 204;
      yield *next;
    });

    request(app.listen())
    .get("/programming/how-to-node")
    .expect(204, done);
  });

  it("should be as prefix when no methods specified", function (done) {

    var app = koa();
    var router = new Router(app);
    app.use(router.middleware());

    router.mount("/:category/:title", function *() {

      this.status = 204;
    });

    router.routes[0].asPrefix.should.be.true;

    request(app.listen())
    .get("/programming/how-to-node/hello")
    .expect(204, done);
  });

  it("should make `asPrefix` false when some methods specified", function () {

    var route = new Route("/", ["get"], [function *() {}]);
    route.methods.should.have.property("length", 1);
    route.asPrefix.should.be.false;
  });

  describe("Route#match()", function () {

    it("should capture URL path parameters", function (done) {

      var app = koa();
      app.use(Router(app))
      .get("/:category/:title", function *(next) {

        should.exist(this.params);
        this.params.should.be.type("object");
        this.params.should.have.property("category", "match");
        this.params.should.have.property("title", "this");
        this.status = 204;
      });

      request(app.listen())
      .get("/match/this")
      .expect(204, done);
    });

    it("should return original path parameters when decodeURIComponent throw error", function (done) {
      
      var app = koa();
      app.use(Router(app))
      .get("/:category/:title", function *(next) {

        should.exist(this.params);
        this.params.should.be.type("object");
        this.params.should.have.property("category", "100%");
        this.params.should.have.property("title", "101%");
        this.status = 204;
      });

      request(app.listen())
      .get("/100%/101%")
      .expect(204, done);
    });

    it("should populate ctx.params with regexp captures", function (done) {

      var app = koa();
      app.use(Router(app))
      .get(/^\/api\/([^\/]+)\/?/i, function *(next) {

        should.exist(this.params);
        this.params.should.be.type("object");
        this.params.should.have.property(0, "1");
        yield *next;
      }, function *(next) {

        this.should.have.property("params");
        this.params.should.be.type("object");
        this.params.should.have.property(0, "1");
        this.status = 204;
      });

      request(app.listen())
      .get("/api/1")
      .expect(204, done);
    });

    it("should populate ctx.params with regexp captures including undefined", function (done) {

      var app = koa();
      app.use(Router(app))
      .get(/^\/api(\/.+)?/i, function *(next) {

        should.exist(this.params);
        this.params.should.be.type("object");
        this.params.should.have.property(0, undefined);
        yield *next;
      }, function *(next) {

        this.should.have.property("params");
        this.params.should.be.type("object");
        this.params.should.have.property(0, undefined);
        this.status = 204;
      });

      request(app.listen())
      .get("/api")
      .expect(204, done);
    });

    it("can koa instance as middleware", function () {

      var app = koa();
      app.use(Router(app));

      (function () {

        app.get("foo", "/foo", koa());
      }).should.not.throw();
    });

    it("should throw friendly error message when handle not exists", function () {

      var app = koa();
      app.use(Router(app));

      (function () {

        app.get("/foo", undefined);
      }).should.throw("get `/foo`: `middleware` must be a function or application, not `undefined`");

      (function () {

        app.get("foo", "/foo", undefined);
      }).should.throw("get `foo`: `middleware` must be a function or application, not `undefined`");

      (function () {

        app.post("/foo", function *() {}, undefined);
      }).should.throw("post `/foo`: `middleware` must be a function or application, not `undefined`");
    });
  });

  describe("Route#param()", function () {

    it("should compose middleware for param fn", function (done) {

      var app = koa();
      var router = new Router(app);
      var route = new Route("/users/:user", ["GET"], [function *(next) {
        this.body = this.user;
      }]);

      route.param("user", function *(id, next) {

        this.user = {
          name: "alex",
          id: id
        };

        if (!id) {
          return this.status = 404;
        }
        yield *next;
      });

      router.routes.push(route);
      app.use(router.middleware());
      request(app.listen())
      .get("/users/3")
      .expect(200, function (err, res) {

        if (err) {
          return done(err);
        }

        res.should.have.property("body");
        res.body.should.have.property("name", "alex");
        res.body.should.have.property("id", "3");
        done();
      });
    });

    it("should ignore params which are not matched", function (done) {

      var app = koa();
      var router = new Router(app);
      var route = new Route("/users/:user", ["GET"], [function *(next) {
        this.body = this.user;
      }]);

      route.param("user", function *(id, next) {

        this.user = {
          name: "alex",
          id: id
        };

        if (!id) {
          return this.status = 404;
        }
        yield *next;
      });

      route.param("title", function *(title, next) {

        this.user = {
          name: "mark",
          id: id
        };

        if (!id) {
          return this.status = 404;
        }

        yield *next;
      });

      router.routes.push(route);
      app.use(router.middleware());
      request(app.listen())
      .get("/users/3")
      .expect(200, function (err, res) {

        if (err) {
          return done(err);
        }

        res.should.have.property("body");
        res.body.should.have.property("name", "alex");
        res.body.should.have.property("id", "3");
        done();
      });
    });
  });

  describe("Route#url()", function () {

    it("should generate route URL", function () {

      var route = new Route("/:category/:title", ["get"], [function *() {}], "books");

      route.url({
        category: "programming",
        title: "how-to-node"
      }).should.equal("/programming/how-to-node");

      route.url("programming", "how-to-node")
      .should.equal("/programming/how-to-node");
    });

    it("should escape using encodeURIComponent()", function () {

      var route = new Route("/:category/:title", ["get"], [function *() {}], "books");

      route.url({
        category: "programming",
        title: "how to node"
      }).should.equal("/programming/how%20to%20node");

      route.url("programming", "how to node")
      .should.equal("/programming/how%20to%20node");
    });
  });
});