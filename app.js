
/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , logger = require('morgan')
  , methodOverride = require('method-override')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser')
  , session = require('express-session')
  , favicon = require('serve-favicon')
  , errorHandler = require('errorhandler')
  , MongoStore = require('connect-mongo')(session)
  , mongojs = require('mongojs')
  , olin = require('olin')
  , rem = require('rem')
  , uuid = require('uuid');

process.on('uncaughtException', function(err) {
  console.error('Uncaught exception: ' + err);
});


/**
 * App.
 */

var app = express(), db;
var env = process.env.NODE_ENV || 'development';

db = mongojs(process.env.MONGOLAB_URI || 'olinapps', ['users']);
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.set('secret', process.env.SESSION_SECRET || 'terrible, terrible secret')
// app.use(favicon());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(methodOverride());
app.use(cookieParser(app.get('secret')));
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: app.get('secret'),
  // cookie: { domain:'.olinapps.com'},
  store: new MongoStore({
    url: process.env.MONGOLAB_URI || 'mongodb://localhost/olinapps'
  })
}));

app.use(express.static(path.join(__dirname, 'public')));

if (env == 'development'){
  app.set('host', 'localhost:' + app.get('port'));
  app.use(errorHandler());  
};

if (env == 'production'){
  app.set('host', 'www.olinapps.com');
};


/**
 * Helpers
 */


function emailLocalPart (email) {
  return email.split('@')[0];
}


function emailDomainPart (email) {
  return email.split('@')[1];
}


// Ensure a user exists when they first log in.
// If not, create them.

function ensureUser (email, next) {
  email = email.toLowerCase();
  db.users.findOne({
    _id: emailLocalPart(email)
  }, function (err, user) {
    if (err || user) {
      next(err, user);
    } else {
      var user = {
        _id: emailLocalPart(email),
        domain: emailDomainPart(email),
        created: Date.now(),
        sessionid: null
      };
      db.users.save(user, function (err) {
        next(err, user);
      })
    }
  });
}


// Generate session for a user who has logged in,
// including reusing their old session token.

function generateSession (req, user, next) {
  if (user.sessionid) {
    req.session.sessionid = user.sessionid;
    next(null, req.session.sessionid);
  } else {
    req.session.sessionid = user.sessionid = String(uuid.v1());
    db.users.update({
      _id: user._id
    }, user, function (err) {
      next(err, req.session.sessionid);
    })
  }
}


// Get user who is logged in from an HTTP request.

function getSessionUser (req, next) {
  console.log('IDs', req.query.sessionid, req.session.sessionid);
  if (!req.session.sessionid && !req.query.sessionid) {
    next(null, null);
  } else {
    // Normalize from query parameter or session.
    req.session.sessionid = req.query.sessionid || req.session.sessionid;

    // Find user.
    db.users.findOne({
      sessionid: req.session.sessionid
    }, function (err, user) {
      if (!user) {
        delete req.session.sessionid;
      }
      if (user) {
        user.id = user._id;
      }
      next(err, user);
    });
  }
}


// Convert a user entry into a nice JSON format.

function jsonifyUser (user) {
  user = JSON.parse(JSON.stringify(user));
  delete user._id;
  delete user.sessionid;
  user.email = user.id + '@' + user.domain;
  return user;
}


/**
 * Routes
 */

app.get('/', function (req, res) {
  getSessionUser(req, function (err, user) {
    res.render('index.jade', {
      title: 'Olin Apps',
      external: req.query.external,
      user: user
    });
  })
})

app.get('/authenticate', function (req, res) {
  res.redirect('/login');
})

app.get('/api', function (req, res) {
  getSessionUser(req, function (err, user) {
    res.render('api.jade', {
      title: 'Olin Apps',
      user: user
    });
  });
})

app.get('/external', function (req, res) {
  getSessionUser(req, function (err, user) {
    if (err || !user) {
      res.redirect('/login?external=' + req.query.callback);
    } else {
      res.render('external.jade', {
        title: 'Olin Apps',
        external: req.query.callback,
        domain: req.query.callback && require('url').parse(req.query.callback).hostname,
        user: user,
        sessionid: user.sessionid
      });
    }
  });
});

app.get('/login', function (req, res) {
  // Require that this be on the Heroku HTTPS domain, not on olinapps.com
  if (process.env.NODE_ENV == 'production' && req.headers.host != 'olinapps.herokuapp.com') {
    return res.redirect('https://olinapps.herokuapp.com/login' + ('external' in req.query ? '?external=' + req.query.external : ''));
  }

  getSessionUser(req, function (err, user) {
    if (user) {
      if (req.query.external) {
        return res.redirect('/external?callback=' + req.query.external);
      } else {
        return res.redirect('http://' + app.get('host') + '/?sessionid=' + user.sessionid);
      }
    }

    res.render('login.jade', {
      title: 'Olin Apps',
      external: req.query.external,
      domain: req.query.external && require('url').parse(req.query.external).hostname,
      user: user
    });
  });
});

/* POST */

function login (username, password, next) {
  rem.json('http://foundry.olin.edu/login.php').post('form', {
    username: username,
    password: password,
  }, next);
}

app.post('/login', function (req, res) {
  if (req.body.username && req.body.password) {
    try {
      login(req.body.username, req.body.password, function (err, json) {
        if (err || json.error) {
          res.render('login.jade', {
            title: 'Olin Apps',
            username: req.body.username,
            external: req.query.external,
            domain: req.query.external && require('url').parse(req.query.external).hostname,
            message: 'Your credentials were invalid. Please try again.',
            user: null
          });
        } else {
          var email = json.email;
          ensureUser(email, function (err, user) {
            generateSession(req, user, function (err, sessionid) {
              // Finished logging in, now redirect back to non HTTPS domain.
              if (req.query.external) {
                res.redirect('http://' + app.get('host') + '/login?sessionid=' + sessionid + '&external=' + req.query.external);
              } else {
                res.redirect('http://' + app.get('host') + '/login?sessionid=' + sessionid);
              }
            })
          });
        }
      });
    } catch (e) {
      res.render('login.jade', {
        title: 'Olin Apps',
        external: req.query.external,
        domain: req.query.external && require('url').parse(req.query.external).hostname,
        message: 'Your credentials were invalid. Please try again.',
        user: null
      });
    }
  } else {
    res.render('login.jade', {
      title: 'Olin Apps',
      external: req.query.external,
      domain: req.query.external && require('url').parse(req.query.external).hostname,
      message: 'Please enter a username and password.',
      user: null
    });
  }
});

app.all('/logout', function (req, res) {
  getSessionUser(req, function (err, user) {
    delete req.session.sessionid;
    if (user) {
      delete user.sessionid;
      db.users.update({
        _id: user._id
      }, user, function () {
        res.redirect('/');
      })
    } else {
      res.redirect('/');
    }
  });
});


/**
 * API
 */

app.get('/api/me', function (req, res) {
  getSessionUser(req, function (err, user) {
    if (err || !user) {
      res.json({error: true, message: 'Not logged in.'}, 404);
    } else {
      res.json({error: false, user: jsonifyUser(user)});
    }
  });
});

app.get('/api/sessionid', function (req, res) {
  getSessionUser(req, function (err, user) {
    console.log('SESSIONID', err, user);
    if (err || !user) {
      res.json({error: true, message: 'Not logged in.'}, 404);
    } else {
      res.json({error: false, sessionid: user.sessionid});
    }
  });
});

function apiNetworkLogin (req, res) {
  if (req.body.username && req.body.password) {
    login(req.body.username, req.body.password, function (err, json) {
      try {
        if (!json || !json.email) {
          res.json({error: true, message: 'Invalid credentials.'}, 401);
        } else {
          var email = json.email.toLowerCase();
          ensureUser(email, function (err, user) {
            generateSession(req, user, function (err, sessionid) {
              res.json({
                error: false,
                sessionid: sessionid,
                user: jsonifyUser(user)
              });
            })
          });
        }
      } catch (e) {
        console.error('CATCH TO NOT BREAK REM', e);
      }
    });
  } else {
    res.json({error: true, message: 'No credentials provided.'}, 400);
  }
}

app.post('/api/networklogin', apiNetworkLogin);
app.post('/api/exchangelogin', apiNetworkLogin); // deprecated


/**
 * "apps"
 */

// These variables will be needed by our apps.
exports.app = app;
exports.getSessionUser = getSessionUser;
exports.db = db;

// Nothing magical here, just continue adding routes
// just combine them logically in different files.
require('./apps/directory');
require('./apps/calendar');
require('./apps/dining');
require('./apps/printers');
require('./apps/launchpad');


/**
 * Launch
 */

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on http://" + app.get('host'));
});
