import os, bcrypt, uuid, time, requests, json
from urlparse import urlparse
from flask import Flask, send_from_directory, jsonify, session, request, redirect, render_template, Response
from pymongo import Connection, ASCENDING, DESCENDING
from bson.code import Code
from bson.objectid import ObjectId

#
# Database
#

from urlparse import urlsplit
MONGO_URL = os.getenv('MONGOLAB_URI', 'mongodb://localhost:27017/olinapps-auth')
parsed_mongo = urlsplit(MONGO_URL)
db_name = parsed_mongo.path[1:]
# Get db connection.
print('Connecting to %s [db %s]' % (MONGO_URL, db_name))
db = Connection(MONGO_URL)[db_name]
# Authenticate.
if '@' in MONGO_URL:
    user_pass = parsed_mongo.netloc.split('@')[0].split(':')
    db.authenticate(user_pass[0], user_pass[1])

#
# Passwords
#

def hash_password(password):
  # Hash a password for the first time, with a randomly-generated salt
  return bcrypt.hashpw(password, bcrypt.gensalt())

def match_password(password, hashed):
  return bcrypt.hashpw(password, hashed) == hashed


#
# Server
#

"""
On reset, we check if the username is a proxy name or not.
"""

app = Flask(__name__)
app.secret_key = os.getenv('SESSION_SECRET');

def email_local_part(email):
  return email.split('@')[0]

def email_domain_part(email):
  return email.split('@')[1]

MAILGUN_KEY = os.getenv('MAILGUN_API_KEY')
MAILGUN_URL = "https://api.mailgun.net/v2/olinapps.mailgun.org"

def reset_password(user):
  # Update user reset token
  token = str(uuid.uuid1())
  user['resettoken'] = token
  db.users.update({"_id": user['_id']}, user)

  r = requests.post(MAILGUN_URL + "/messages", auth=("api", MAILGUN_KEY), data={
    "from": "no-reply@olinapps.mailgun.org",
    "to": user['_id'] + '@' + user['domain'],
    "subject": "Olin Apps Password Reset",
    "text": "Please reset your password by following this link:\n\nhttp://olinapps.com/reset?token=" + token
    })

def ensure_user(email):
  email = email.lower()
  try:
    user = db.users.find_one({
      "_id": email_local_part(email)
      })
    if not user:
      user = {
        "_id": email_local_part(email),
        "domain": email_domain_part(email),
        "password": None,
        "created": int(time.time()),
        "resettoken": None,
        "session": None
        }
      db.users.insert(user)
    return user
  except Exception:
    return None

def generate_session(user):
  # Session ID.
  if not user.get('sessionid'):
    user['sessionid'] = str(uuid.uuid1())
    db.users.update({"_id": user['_id']}, user)
  session['sessionid'] = user['sessionid']
  return user['sessionid']

def get_session_user():
  if 'sessionid' not in session and not request.args.get('sessionid'):
    return None
  return db.users.find_one({
    "sessionid": session.get('sessionid') or request.args.get('sessionid')
    })

@app.route('/reset', methods=['GET', 'POST'])
def route_reset():
  user = db.users.find_one({
    "resettoken": request.args.get('token')
    })
  if not request.args.get('token') or not user:
    if request.method == 'GET':
      return render_template('reset.html',
        create=request.args.has_key('create')
        )
    else:
      reset_password(ensure_user(request.form.get('email')))
      return render_template('reset_sent.html')

  if request.args.get('token') and request.method == 'GET':
    return render_template('reset_pass.html', 
      create=request.args.has_key('create'),
      user=user
      )

  password = request.form.get('password', '')
  if len(password) < 8:
    return render_template('reset_pass.html',
      user=user,
      create=request.args.has_key('create'),
      message="Password must be at least eight characters long."
      )

  # Update user
  user['password'] = hash_password(password)
  user['resettoken'] = None
  db.users.update({"_id": user['_id']}, user)
  generate_session(user)

  return redirect('/')

@app.route('/')
def route_index():
  user = get_session_user()
  return render_template('index.html',
    external=request.args.get('external'),
    user=user)

@app.route('/api')
def route_api():
  user = get_session_user()
  return render_template('api.html',
    user=user)

@app.route('/api/me')
def route_api_me():
  user = get_session_user()
  if user:
    return jsonify(error=False, user={
      "domain": user['domain'],
      "id": user['_id'],
      "created": user['created']
      })
  else:
    return jsonify(error=True)

@app.route('/api/sessionid')
def route_api_sessionid():
  user = get_session_user()
  if user:
    return jsonify(error=False, sessionid=user['sessionid'])
  else:
    return jsonify(error=True)

@app.route('/external')
def route_external():
  user = get_session_user()
  if user:
    return render_template('external.html',
      external=request.args.get('callback'),
      domain=urlparse(request.args.get('callback', '')).netloc,
      sessionid=session['sessionid'],
      user=user)
  else:
    return redirect('/login?external=%s' % request.args.get('callback'))

@app.route('/login', methods=['GET', 'POST'])
def route_login():
  if request.method == 'GET':
    user = get_session_user()
    return render_template('login.html',
      external=request.args.get('external'),
      domain=urlparse(request.args.get('external')).netloc if request.args.get('external') else None,
      user=user)
  # Normalize username.
  else:
    username = request.form.get('email')
    if not username:
      return render_template('login.html',
        external=request.args.get('external'),
        domain=urlparse(request.args.get('external')).netloc if request.args.get('external') else None,
        message="Please enter an email address.")

  # Check for canonical emails.
  if email_domain_part(username) not in ['olin.edu', 'students.olin.edu', 'alumni.olin.edu']:
    return render_template('login.html',
      external=request.args.get('external'),
      domain=urlparse(request.args.get('external')).netloc if request.args.get('external') else None,
      message="Not a valid olin.edu email address.",
      email=username)

  # Lookup user.
  user = ensure_user(username)

  # Reset or match password.
  # if not user['password']:
  #   reset_password(user)
  #   return render_template('reset_sent.html')
  if not user['password'] or not match_password(request.form.get('password'), user['password']):
    return render_template('login.html',
      external=request.args.get('external'),
      domain=urlparse(request.args.get('external')).netloc if request.args.get('external') else None,
      message="No such user or invalid password. If you are trying to create an Olin Apps account, <a href=\"/reset?create\">click here</a>.",
      email=username)

  generate_session(user)

  #if request.args.get('callback') and 'external' in request.args:
  #  return redirect(request.args.get('callback') + '?sessionid=' + session['sessionid'])

  if request.args.get('external'):
    return redirect('/external?callback=%s' % request.args.get('external'))
  return redirect('/')

@app.route('/logout', methods=['POST'])
def route_logout():
  user = get_session_user()
  if user:
    user.pop('sessionid', None)
    db.users.update({"_id": user['_id']}, user)
  session.pop('sessionid', None)
  return redirect('/')


# Exchange login
# -----------

import urllib2, re, getpass, urllib2, base64
from urllib2 import URLError
from ntlm import HTTPNtlmAuthHandler

def network_login(dn, user, password):
  try:
    url = "https://webmail.olin.edu/ews/exchange.asmx"

    # setup HTTP password handler
    passman = urllib2.HTTPPasswordMgrWithDefaultRealm()
    passman.add_password(None, url, dn + '\\' + user, password)
    # create NTLM authentication handler
    auth_NTLM = HTTPNtlmAuthHandler.HTTPNtlmAuthHandler(passman)
    proxy_handler =  urllib2.ProxyHandler({})
    opener = urllib2.build_opener(proxy_handler,auth_NTLM)

    # this function sends the custom SOAP command which expands
    # a given distribution list
    data = """<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <soap:Body>
    <ResolveNames xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"
                  xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
                  ReturnFullContactData="true">
      <UnresolvedEntry>%s</UnresolvedEntry>
    </ResolveNames>
    </soap:Body>
  </soap:Envelope>
  """ % user
    # send request
    headers = {'Content-Type': 'text/xml; charset=utf-8'}
    req = urllib2.Request(url, data=data, headers=headers)
    res = opener.open(req).read()

    # parse result
    return re.search(r'<t:EmailAddress>([^<]+)</t:EmailAddress>', res).group(1).lower()
  except Exception, e:
    print e
    return False


# API

@app.route('/api/exchangelogin', methods=['POST'])
def api_exchangelogin():
  if request.form.has_key('username') and request.form.has_key('password'):
    email = network_login('MILKYWAY', request.form['username'], request.form['password'])
    if email:
      user = ensure_user(email)
      sessionid = generate_session(user)
      return Response(json.dumps({
        "sessionid": sessionid,
        "user": {
          "domain": user['domain'],
          "id": user['_id'],
          "created": user['created']
          }}), 200, {'Content-Type': 'application/json'})
  return Response(json.dumps({"error": "Invalid login."}), 401, {'Content-Type': 'application/json'})


#
# Launch
#

if __name__ == '__main__':
    # Bind to PORT if defined, otherwise default to 5000.
    port = int(os.environ.get('PORT', 5000))
    app.debug = True
    app.run(host='0.0.0.0', port=port)
