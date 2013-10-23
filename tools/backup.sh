#!/bin/sh

# Create a database dump of olinapps
# save it to tools/backups

pushd .. 
export MONGOURI="$(heroku config | grep MONGOLAB_URI | cut -c 16-)"
popd
export FOLDER=backups/$(date +'%Y-%m-%d')
mkdir -p $FOLDER
pushd $FOLDER
mongoctl dump $MONGOURI
popd

echo
echo BACKUP NOW LOCATED IN tools/$FOLDER
echo "RESTORE WITH mongoctl restore $MONGOLAB_URI"
echo "GOODBYE"