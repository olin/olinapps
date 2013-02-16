
/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , olinapps = require('olinapps')
  , mongojs = require('mongojs');

var app = express(), db;

app.configure(function () {
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('your secret here'));
  app.use(express.session());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
  db = mongojs(process.env.MONGOLAB_URI || 'olinapps-quotes', ['quotes']);
});

app.configure('development', function () {
  app.set('host', 'localhost:3000');
  app.use(express.errorHandler());
});

app.configure('production', function () {
  app.set('host', 'quotes.olinapps.com');
});

/**
 * Authentication
 */

app.post('/login', olinapps.login);
app.all('/logout', olinapps.logout);
app.all('/*', olinapps.middleware);

/**
 * Routes
 */

app.get('/', function (req, res) {
  db.quotes.find().sort({date: -1}, function (err, docs) {
    res.render('index', {
      title: 'Olin Quotes',
      quotes: docs
    });
  })
});

app.get('/names', function (req, res) {
  db.quotes.distinct('name', function (err, names) {
    res.json(names);
  });
})

app.post('/quotes', function (req, res) {
  if (req.body.name && req.body.quote) {
    db.quotes.save({
      name: req.body.name,
      quote: req.body.quote,
      submitter: olinapps.getSessionUser(req).username,
      date: Date.now()
    }, res.redirect.bind(res, '/'));
  } else {
    res.json({error: true, message: 'Invalid quote'}, 500);
  }
})

/**
 * Launch
 */

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on http://" + app.get('host'));
});
