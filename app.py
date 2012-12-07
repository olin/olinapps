import os, bcrypt, uuid, time, requests
from urlparse import urlparse
from flask import Flask, send_from_directory, jsonify, session, request, redirect, render_template
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
app.secret_key = 'https://ia600808.us.archive.org/27/items/FoundryAndOlinPresentationByMichaelMoody/'

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
    "text": "Please reset your password by following this link:\n\nhttp://auth.olinapps.com/reset?token=" + token
    })

def ensure_user(email):
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

def get_session_user():
  if 'sessionid' not in session:
    return None
  return db.users.find_one({
    "sessionid": session['sessionid']
    })

@app.route('/reset', methods=['GET', 'POST'])
def route_reset():
  user = db.users.find_one({
    "resettoken": request.args.get('token')
    })
  if not request.args.get('token') or not user:
    if request.method == 'GET':
      return render_template('reset.html')
    else:
      reset_password(ensure_user(request.form.get('email')))
      return render_template('reset_sent.html')

  if request.args.get('token') and request.method == 'GET':
    return render_template('reset_pass.html', user=user)

  password = request.form.get('password', '')
  if len(password) < 8:
    return render_template('reset_pass.html',
      message="Password must be at least eight characters long.")

  # Update user
  user['password'] = hash_password(password)
  user['resettoken'] = None
  db.users.update({"_id": user['_id']}, user)
  generate_session(user)

  return redirect('/')

@app.route('/')
def route_index():
  user = get_session_user()
  return render_template('login.html',
    external=request.args.get('external'),
    user=user)

@app.route('/external')
def route_external():
  user = get_session_user()
  if True:
    return render_template('external.html',
      external=request.args.get('callback'),
      sessionid=session['sessionid'])
  else:
    return redirect('/?external=%s' % request.args.get('callback'))

@app.route('/login', methods=['POST'])
def route_login():
  # Normalize username.
  username = request.form.get('email')
  if not username:
    return render_template('login.html',
      external=request.args.get('external'),
      message="Please enter an email address.")

  # Check for canonical emails.
  if email_domain_part(username) not in ['olin.edu', 'students.olin.edu', 'alumni.olin.edu']:
    return render_template('login.html',
      external=request.args.get('external'),
      message="Not a valid olin.edu email address.",
      email=username)

  # Lookup user.
  user = ensure_user(username)

  # Reset or match password.
  if not user['password']:
    reset_password(user)
    return render_template('reset_sent.html')
  if not match_password(request.form.get('password'), user['password']):
    return render_template('login.html',
      external=request.args.get('external'),
      message="No such user or invalid password.",
      email=username)

  generate_session(user)

  #if request.args.get('callback') and 'external' in request.args:
  #  return redirect(request.args.get('callback') + '?sessionid=' + session['sessionid'])

  if request.args.get('external'):
    return redirect('/external?%s' % request.args.get('external'))
  return redirect('/')

@app.route('/logout', methods=['POST'])
def route_logout():
  user = get_session_user()
  if user:
    user.pop('sessionid', None)
    db.users.update({"_id": user['_id']}, user)
  session.pop('sessionid', None)
  return redirect('/')


#
# Launch
#

if __name__ == '__main__':
    # Bind to PORT if defined, otherwise default to 5000.
    port = int(os.environ.get('PORT', 5000))
    app.debug = True
    app.run(host='0.0.0.0', port=port)
