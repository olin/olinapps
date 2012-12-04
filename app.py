import os, bcrypt
from flask import Flask, send_from_directory, jsonify
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

@app.route('/')
def hello():
  return jsonify(match=match_password('noise in our streets', hash_password('noise in our streets')))
  return jsonify(words=[user['nothing'] for user in db.sessions.find()])

# Serve index.html pages.
@app.route('/<path:filename>')
def pretty_static(filename):
  if filename.endswith('/'):
    filename += 'index.html'
  return send_from_directory('static', filename)


#
# Launch
#

if __name__ == '__main__':
    # Bind to PORT if defined, otherwise default to 5000.
    port = int(os.environ.get('PORT', 5000))
    app.debug = True
    app.run(host='0.0.0.0', port=port)
