import os, bcrypt, uuid, time, requests
from flask import Flask, send_from_directory, jsonify, session, request, redirect
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
    "to": "tim@timryan.org",
    "subject": "Olin Apps Password Reset",
    "text": "Please reset your password by following this link:\n\nhttp://auth.olinapps.com/reset?token=" + token
    })
  return """An email has been sent to your account."""

def generate_session(user):
  # Session ID.
  if not user.get('sessionid'):
    user['sessionid'] = str(uuid.uuid1())
    db.users.update({"_id": user['_id']}, user)
  session['sessionid'] = user['sessionid']

@app.route('/reset', methods=['GET', 'POST'])
def route_reset():
  user = db.users.find_one({"resettoken": request.args.get('token')})
  if not request.args.get('token') or not user:
    return jsonify(message='Invalid token.')

  if request.method == 'GET':
    return send_from_directory('static', 'reset.html')
  else:
    password = request.form.get('password', '')
    if len(password) < 8:
      return jsonify(message="Password must be >= 8 characters long.")

    # Update user
    user['password'] = hash_password(password)
    user['resettoken'] = None
    db.users.update({"_id": user['_id']}, user)
    generate_session(user)

    # Redirect
    return redirect('/')

@app.route('/login', methods=['POST'])
def route_login():
  # Normalize username.
  username = request.form.get('username')
  if not username:
    return jsonify(message="No such user or invalid password.")

  # Check for canonical emails.
  if email_domain_part(username) not in ['olin.edu', 'students.olin.edu', 'alumni.olin.edu']:
    return jsonify(message='Invalid email address.')

  # Lookup user.
  user = db.users.find_one({
    "_id": email_local_part(username)
    })

  # Create user.
  if not user:
    user = {
      "_id": email_local_part(username),
      "password": None,
      "created": int(time.time()),
      "resettoken": None,
      "session": None
      }
    db.users.insert(user)

  # Reset or match password.
  if not user['password']:
    return reset_password(user)
  if not match_password(request.form.get('password'), user['password']):
    return jsonify(message="No such user or invalid password.")

  generate_session(user)

  return jsonify(message="Logged in.", sessionid=user['sessionid'])

@app.route('/logout', methods=['POST'])
def route_logout():
  if 'sessionid' not in session:
    return jsonify(message="You are not logged in.")
  user = db.users.find_one({
    "sessionid": session['sessionid']
    })
  if user:
    user.pop('sessionid', None)
    db.users.update({"_id": user['_id']}, user)
  session.pop('sessionid', None)
  return jsonify(message="Session cleared.")

# Serve index.html pages.
def static_index(filename = ''):
  if filename.endswith('/') or not filename:
    filename += 'index.html'
  return send_from_directory('static', filename)

app.add_url_rule('/<path:filename>', 'static_index', static_index)
app.add_url_rule('/', 'static_index', static_index)


#
# Launch
#

if __name__ == '__main__':
    # Bind to PORT if defined, otherwise default to 5000.
    port = int(os.environ.get('PORT', 5000))
    app.debug = True
    app.run(host='0.0.0.0', port=port)
