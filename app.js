
/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , mongojs = require('mongojs')
  , MongoStore = require('connect-mongo')(express)
  , nunjucks = require('nunjucks')
  , olin = require('olin')
  , uuid = require('uuid');

var app = express(), db;

var env = new nunjucks.Environment(new nunjucks.FileSystemLoader('views'));

env.express(app);

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
  app.set('host', 'quotes.olinapps.com');
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
      db.users.save(user, function (err, user) {
        console.log(err, user);
        next(err, user);
      })
    }
  });
}

// def ensure_user(email):
//   email = email.lower()
//   try:
//     user = db.users.find_one({
//       "_id": email_local_part(email)
//       })
//     if not user:
//       user = {
//         "_id": email_local_part(email),
//         "domain": email_domain_part(email),
//         "password": None,
//         "created": int(time.time()),
//         "resettoken": None,
//         "session": None
//         }
//       db.users.insert(user)
//     return user
//   except Exception:
//     return None

function generateSession (req, user, next) {
  if (user.sessionid) {
    req.session.sessionid = user.sessionid;
    next(null, user.sessionid);
  } else {
    req.session.sessionid = user.sessionid = String(uuid.v1());
    db.users.update({
      _id: user._id
    }, user, function (err) {
      next(err, user);
    })
  }
}

// def generate_session(user):
//   # Session ID.
//   if not user.get('sessionid'):
//     user['sessionid'] = str(uuid.uuid1())
//     db.users.update({"_id": user['_id']}, user)
//   session['sessionid'] = user['sessionid']
//   return user['sessionid']

function getSessionUser (req, next) {
  if (!req.session.sessionid && !req.query.sessionid) {
    next(null, null);
  } else {
    db.users.findOne({
      sessionid: req.session.sessionid
    }, next);
  }
}

// def get_session_user():
//   if 'sessionid' not in session and not request.args.get('sessionid'):
//     return None
//   return db.users.find_one({
//     "sessionid": session.get('sessionid') or request.args.get('sessionid')
//     })

function jsonifyUser (user) {
  return {
    domain: user.domain,
    id: user.id,
    created: user.created
  };
}

/**
 * Routes
 */

app.get('/', function (req, res) {
  getSessionUser(req, function (err, user) {
    res.render('index.html', {
      external: req.query.external,
      user: user
    });
  })
})

app.get('/api', function (req, res) {
  getSessionUser(req, function (err, user) {
    res.render('api.html', {
      user: user
    });
  });
})

app.get('/api/me', function (req, res) {
  getSessionUser(req, function (err, user) {
    if (err || !user) {
      res.json({error: true, message: 'Not logged in.'}, 404);
    } else {
      res.json({error: false, user: jsonifyUser(user)});
    }
  });
})

// @app.route('/api/me')
// def route_api_me():
//   user = get_session_user()
//   if user:
//     return jsonify(error=False, user={
//       "domain": user['domain'],
//       "id": user['_id'],
//       "created": user['created']
//       })
//   else:
//     return jsonify(error=True)

app.get('/api/sessionid', function (req, res) {
  getSessionUser(req, function (err, user) {
    if (err || !user) {
      res.json({error: true, message: 'Not logged in.'}, 404);
    } else {
      res.json({error: false, sessionid: user.sessionid});
    }
  });
})

// @app.route('/api/sessionid')
// def route_api_sessionid():
//   user = get_session_user()
//   if user:
//     return jsonify(error=False, sessionid=user['sessionid'])
//   else:
//     return jsonify(error=True)

app.get('/external', function (req, res) {
  getSessionUser(req, function (err, user) {
    if (err || !user) {
      res.redirect('/login?external=' + req.query.callback);
    } else {
      res.render('external.html', {
        external: req.query.external,
        domain: req.query.external && require('url').parse(req.query.external).hostname,
        user: user,
        sessionid: user.sessionid
      });
    }
  });
})

// @app.route('/external')
// def route_external():
//   user = get_session_user()
//   if user:
//     return render_template('external.html',
//       external=request.args.get('callback'),
//       domain=urlparse(request.args.get('callback', '')).netloc,
//       sessionid=session['sessionid'],
//       user=user)
//   else:
//     return redirect('/login?external=%s' % request.args.get('callback'))

app.get('/login', function (req, res) {
  getSessionUser(req, function (err, user) {
    res.render('login.html', {
      external: req.query.external,
      domain: req.query.external && require('url').parse(req.query.external).hostname,
      user: user
    });
  });
})

app.post('/login', function (req, res) {
  if (req.body.username && req.body.password) {
    olin.networkLogin(req.body.username, req.body.password, function (err, json) {
      if (!json || !json.mailbox || !json.mailbox.emailAddress) {
        res.render('login.html', {
          external: req.query.external,
          domain: req.query.external && require('url').parse(req.query.external).hostname,
          user: user,
          message: 'Your credentials were invalid. Please try again.'
        });
      } else {
        var email = json.mailbox.emailAddress.toLowerCase();
        ensureUser(email, function (err, user) {
          generateSession(req, user, function (err, sessionid) {
            // Finished logging in, now redirection.
            if (req.query.external) {
              res.redirect('http://olinapps.com/external?sessionid=' + sessionid + '&callback=' + req.query.external);
            } else {
              res.redirect('http://olinapps.com/?sessionid=' + sessionid);
            }
          })
        });
      }
    });
  } else {
    res.render('login.html', {
      external: req.query.external,
      domain: req.query.external && require('url').parse(req.query.external).hostname,
      user: user,
      message: 'Please enter a username and password.'
    });
  }
})

// @app.route('/login', methods=['GET', 'POST'])
// def route_login():
//   if request.method == 'GET':
//     user = get_session_user()
//     return render_template('login.html',
//       external=request.args.get('external'),
//       domain=urlparse(request.args.get('external')).netloc if request.args.get('external') else None,
//       user=user)
//   # Normalize username.
//   else:
//     username = request.form.get('email')
//     if not username:
//       return render_template('login.html',
//         external=request.args.get('external'),
//         domain=urlparse(request.args.get('external')).netloc if request.args.get('external') else None,
//         message="Please enter an email address.")

//   # Check for canonical emails.
//   if email_domain_part(username) not in ['olin.edu', 'students.olin.edu', 'alumni.olin.edu']:
//     return render_template('login.html',
//       external=request.args.get('external'),
//       domain=urlparse(request.args.get('external')).netloc if request.args.get('external') else None,
//       message="Not a valid olin.edu email address.",
//       email=username)

//   # Lookup user.
//   user = ensure_user(username)

//   # Reset or match password.
//   # if not user['password']:
//   #   reset_password(user)
//   #   return render_template('reset_sent.html')
//   if not user['password'] or not match_password(request.form.get('password'), user['password']):
//     return render_template('login.html',
//       external=request.args.get('external'),
//       domain=urlparse(request.args.get('external')).netloc if request.args.get('external') else None,
//       message="No such user or invalid password. If you are trying to create an Olin Apps account, <a href=\"/reset?create\">click here</a>.",
//       email=username)

//   generate_session(user)

//   #if request.args.get('callback') and 'external' in request.args:
//   #  return redirect(request.args.get('callback') + '?sessionid=' + session['sessionid'])

//   if request.args.get('external'):
//     return redirect('/external?callback=%s' % request.args.get('external'))
//   return redirect('/')

// @app.route('/logout', methods=['POST'])
// def route_logout():
//   user = get_session_user()
//   if user:
//     user.pop('sessionid', None)
//     db.users.update({"_id": user['_id']}, user)
//   session.pop('sessionid', None)
//   return redirect('/')

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
