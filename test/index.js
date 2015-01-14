/**
 * Module tests
 */

"use strict";

var koa = require("koa");
var should = require("should");


describe("router", function () {

	it("should expose Router", function () {

		var Router = require("..");
		should.exist(Router);
		Router.should.be.type("function");
	});
});