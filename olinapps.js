var request = require('request');

/**
 * Authentication
 */

function loadSession (req, sessionid, next) {
  request('http://olinapps.com/api/me', {
    qs: {"sessionid": sessionid}
  }, function (err, res, body) {
    try {
      var json = JSON.parse(body);
      if (res.statusCode == 200 && json && 'user' in json) {
        req.session['sessionid'] = sessionid;
        req.session['user'] = json.user;
        return next(true);
      }
    } catch (e) { }
    next(false);
  });
}

function getUsername (user) {
  return user && user.id;
}

function getEmail (user) {
  return user && (String(user.id) + '@' + String(user.domain));
}

function getSessionUser (req) {
  if (req.session.user) {
    var user = JSON.parse(JSON.stringify(req.session.user));
    user.username = getUsername(user);
    user.email = getEmail(user);
    return user;
  }
  return null;
}

function login (req, res) {
  // External login.
  loadSession(req, req.body.sessionid, function (success) {
    if (success) {
      res.redirect('/');
    } else {
      delete req.session['sessionid'];
      res.send('Invalid session token: ' + JSON.stringify(req.body.sessionid));
    }
  });
}

function logout (req, res) {
  delete req.session['sessionid'];
  delete req.session['user'];
  res.redirect('/');
}

function redirectLogin (req, res, next) {
  res.redirect('http://olinapps.com/external?callback=http://' + req.app.get('host') + '/login');
}

function middleware (req, res, next) {
  if (getSessionUser(req)) {
    next();
  } else if ('sessionid' in req.query) {
    loadSession(req, req.query.sessionid, function (success) {
      if (success) {
        res.redirect('/');
      } else {
        res.send('Invalid session token: ' + JSON.stringify(req.query.sessionid));
      }
    });
  } else {
    redirectLogin(req, res, next);
  }
}

/**
 * Exports
 */

module.exports = {
  loadSession: loadSession,
  getSessionUser: getSessionUser,
  login: login,
  logout: logout,
  middleware: middleware
};