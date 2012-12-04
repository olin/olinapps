import os
from flask import Flask, send_from_directory

from pymongo import Connection, ASCENDING, DESCENDING
from bson.code import Code
from bson.objectid import ObjectId

#
# MongoDB
#

MONGO_URL = os.getenv('MONGOLAB_URI', 'mongodb://localhost:27017/maumap')
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
# Flask
#

app = Flask(__name__)

@app.route('/')
def hello():
    return 'Hello World!'

@app.route('/<path:filename>')
def pretty_static(filename):
  if filename.endswith('/'):
    filename += 'index.html'
  else:
    filename += '.html'
  return send_from_directory('static', filename)


#
# Launch
#

if __name__ == '__main__':
    # Bind to PORT if defined, otherwise default to 5000.
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
