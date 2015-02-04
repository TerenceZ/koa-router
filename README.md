# An express-style router middleware for [koa](https://github.com/koajs/koa)

[![Build Status](https://secure.travis-ci.org/TerenceZ/siren-router.png)](http://travis-ci.org/TerenceZ/siren-router)

siren-router extends the [koa-router](https://github.com/alexmingoia/koa-router) by:
* Support for mounting generator function and koa instance using `app.mount`.
* Remove routerPath in Router.
* Auto replacing `ctx.path` and `ctx.params` when enter a router and restore back when exit the router.
* Support middleware array to pass in app[verb].

## Install

```
npm install --save siren-router
```

or

```
npm install git://github.com/TerenceZ/siren-router.git
```

## Usage

The usage is the same as [koa-router](https://github.com/alexmingoia/koa-router), except:

### Multiple routers

You can use multiple routers and sets of routes by omitting the `app`
argument. For example, separate routers for two versions of an API:

```javascript
var koa = require('koa');
  , mount = require('koa-mount')
  , Router = require('koa-router');

var app = koa();
app.use(Router(app));

var APIv1 = new Router({ mergeParams: true });
var app2 = koa();

APIv1.get('/sign-in', function *() {
  // ...
});

app2.use(function *() {
  // ...
});

app
  .mount('/v1', APIv1)
  .mount('/v2', app2); // You can mount the application directly.
```

## API

### Router#verb([name, ]path, middleware[, middleware...])

Match URL patterns to callback functions or controller actions using `router.verb()`,
where **verb** is one of the HTTP verbs such as `router.get()` or `router.post()`.

```javascript
app
  .get('/', function *(next) {
    this.body = 'Hello World!';
  })
  .post('/users', [
    function *(next) {
      // ...
    }, function *(next) {
      // ...
    }
  ], function *(next) {
      // ...
  })
  .put('/users/:id', function *(next) {
    // ...
  })
  .delete('/users/:id', function *(next) {
    // ...
  })
  .mount('/users/:id', function *(next) {
    // ...
  });
```

Route paths will be translated to regular expressions used to match requests.

Query strings will not be considered when matching requests.

#### Mounting

Create route for path starting with "/prefix/:id" using `router.mount()` or `router.use()`:

```javascript
app.mount("/prefix/:id", function *(next) {
  // This will match paths like /prefix/abcd, /prefix/abcd/dffgf, etc.
});
```

Notice that the mounting path is forced to be strict, no matter what the `opts.strict` is.

### Auto Replace and Restore the `ctx.path` and `ctx.params`

When enter the router, the `ctx.params` will replace/merge (according to `opts.mergeParams`).

```javascript
app
  .use('/:id', function *(next) {
    console.log(this.path); // => '/update'
    console.log(this.params); // => { id: 'alex' }
    yield *next;
    console.log(this.path); // => '/update'
    console.log(this.params); // => { id: 'alex' }
  })
  .get('/alex/:action', function *(next) {
    console.log(this.path); // => '/'
    console.log(this.params); // => { action: 'update' }
    yield *next;
    console.log(this.path); // => '/'
    console.log(this.params); // => { action: 'update' }
  });
``` 

## Tests

Tests use [mocha](https://github.com/visionmedia/mocha) and can be run
with [npm](https://npmjs.org):

```
npm test
```

## MIT Licensed
