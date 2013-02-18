
/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , olinapps = require('olinapps')
  , mongojs = require('mongojs')
  , MongoStore = require('connect-mongo')(express);

var app = express(), db;

app.configure(function () {
  db = mongojs(process.env.MONGOLAB_URI || 'olinapps-quotes', ['quotes']);
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.set('secret', process.env.SESSION_SECRET || 'terrible, terrible secret')
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser(app.get('secret')));
  app.use(express.session({
    secret: app.get('secret'),
    store: new MongoStore({
      url: process.env.MONGOLAB_URI || 'mongodb://localhost/olinapps-quotes'
    })
  }));
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
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
app.all('/*', olinapps.loginRequired);

/**
 * Routes
 */

app.get('/', function (req, res) {
  db.quotes.find({
    published: true
  }).sort({date: -1}, function (err, docs) {
    console.log(docs);
    res.render('index', {
      title: 'Olin Quotes Board v4.0',
      quotes: docs,
      user: olinapps.user(req)
    });
  })
});

app.post('/delete', function (req, res) {
  db.quotes.update({
    _id: db.ObjectId(req.body.id),
    submitter: olinapps.user(req).username
  }, {
    $set: {
      published: false
    }
  }, function () {
    res.redirect('/');
  })
})

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
      submitter: olinapps.user(req).username,
      date: Date.now(),
      published: true
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
