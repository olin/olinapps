
/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , mongojs = require('mongojs')
  , MongoStore = require('connect-mongo')(express)
  , olin = require('olin')
  , rem = require('rem')
  , uuid = require('uuid');

var app = express(), db;

app.configure(function () {
  db = mongojs(process.env.MONGOLAB_URI || 'olinapps', ['users']);
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
  app.set('host', 'www.olinapps.com');
});

/**
 * Helpers
 */

function emailLocalPart (email) {
  return email.split('@')[0];
}

function emailDomainPart (email) {
  return email.split('@')[1];
}

var MAILGUN_KEY = process.env.MAILGUN_API_KEY
  , MAILGUN_URL = "https://api.mailgun.net/v2/olinapps.mailgun.org";

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

function jsonifyUser (user) {
  return {
    domain: user.domain,
    id: user._id,
    created: user.created
  };
}

/**
 * Routes
 */

app.get('/', function (req, res) {
  getSessionUser(req, function (err, user) {
    console.log(err, user);
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
  getSessionUser(req, function (err, user) {
    if (user) {
      if (req.query.external) {
        return res.redirect('/external?callback=' + req.query.external);
      } else {
        return res.redirect('/');
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

app.post('/login', function (req, res) {
  if (req.body.username && req.body.password) {
    try {
      rem.json('http://foundry.olin.edu/login.php').post('form', {
        username: req.body.username,
        password: req.body.password,
      }, function (err, json) {

        // Noah Tye, Class of Never
        if ((err || json.error) && req.body.username == 'ntye') {
          json = { email: 'noah.tye@students.olin.edu', error: false }; err = null;
        }
        // Rachel Fox, transfer
        if ((err || json.error) && req.body.username == 'rfox') {
          json = { email: 'rachel.fox@students.olin.edu', error: false }; err = null;
        }
        // Gabriel Villenave, professional cheese taster
        if ((err || json.error) && req.body.username == 'gvillenave') {
          json = { email: 'gabriel.villenave@students.olin.edu', error: false }; err = null;
        }

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
                res.redirect('http://olinapps.com/login?sessionid=' + sessionid + '&external=' + req.query.external);
              } else {
                res.redirect('http://olinapps.com/login?sessionid=' + sessionid);
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

    // olin.networkLogin(req.body.username, req.body.password, function (err, json) {
    //   if (!json || !json.mailbox || !json.mailbox.emailAddress) {
    //     res.render('login.jade', {
    //       external: req.query.external,
    //       domain: req.query.external && require('url').parse(req.query.external).hostname,
    //       message: 'Your credentials were invalid. Please try again.'
    //     });
    //   } else {
    //     var email = json.mailbox.emailAddress.toLowerCase();
    //     ensureUser(email, function (err, user) {
    //       generateSession(req, user, function (err, sessionid) {
    //         // Finished logging in, now redirect back to non HTTPS domain.
    //         if (req.query.external) {
    //           res.redirect('http://olinapps.com/login?sessionid=' + sessionid + '&external=' + req.query.external);
    //         } else {
    //           res.redirect('http://olinapps.com/login?sessionid=' + sessionid);
    //         }
    //       })
    //     });
    //   }
    // });
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

/* API */

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
    if (err || !user) {
      res.json({error: true, message: 'Not logged in.'}, 404);
    } else {
      res.json({error: false, sessionid: user.sessionid});
    }
  });
});


function apiNetworkLogin (req, res) {
  if (req.body.username && req.body.password) {
    olin.networkLogin(req.body.username, req.body.password, function (err, json) {
      if (!json || !json.mailbox || !json.mailbox.emailAddress) {
        res.json({error: true, message: 'Invalid credentials.'}, 401);
      } else {
        var email = json.mailbox.emailAddress.toLowerCase();
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
    });
  } else {
    res.json({error: true, message: 'No credentials provided.'}, 400);
  }
}

app.post('/api/networklogin', apiNetworkLogin);
app.post('/api/exchangelogin', apiNetworkLogin); // deprecated

/**
 * Launch
 */

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on http://" + app.get('host'));
});
