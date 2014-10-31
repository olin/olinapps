# olinapps

## Sections

### apps/calendar.js
A common calendar for all things happening around campus.

### apps/dining.js

This is a dining hall menu viewer and API. Needs a separate instance to poll and update the menu regularly.

### apps/directory.js

A listing of all current students and their contact info. Students and alumni can add their own contact information by signing in.

### apps/launchpad.js

This is a static list of websites, all searching is done client-side. You can edit the views/launchpad.jade file to add/change links.

### apps/printers.js

This is a list of printers, regenerated using the `tools/update_printers.sh` script, saved in `data/printers.txt`. Need to be updated for new printers and configurations.

## Contributing

### 1. Set up a dev environment
You'll need to install Node.js, git, and MongoDB. Optionally the Heroku Toolbelt if you have access to the Heroku servers.

#### OS X
Get [Homebrew](http://brew.sh/)
```sh
brew update
brew install node git mongodb heroku
```

#### Debian/Ubuntu
```sh
# node
sudo apt-get install nodejs npm

# git
sudo apt-get install git

# mongodb
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 7F0CEB10
echo 'deb http://downloads-distro.mongodb.org/repo/ubuntu-upstart dist 10gen' | sudo tee /etc/apt/sources.list.d/mongodb.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# heroku
wget -qO- https://toolbelt.heroku.com/install-ubuntu.sh | sh
```

#### Windows Installers
* [Node](http://nodejs.org/download/)
* [MongoDB](http://www.mongodb.org/downloads)
* [Git](http://git-scm.com/download/win) (Download will start immediately after clicking this link)
* [Heroku](https://toolbelt.heroku.com/windows)

### 2. Fork OlinApps on GitHub
https://github.com/olin/olinapps
Once you have your own fork, clone to your computer locally and install the npm packages.
```sh
git clone https://github.com/YourName/olinapps
cd olinapps
npm install
```

### 3. Make your changes and test them locally
First start a mongodb instance with `mongod`.
You can now run the app locally with 
`node app.js`
if you have all of the proper software installed as described above.
```
mongod &
node app.js
```
Now you can open a browser and navigate to `localhost:3000` and see the app.

### 4. Push to GitHub and submit a pull request
After brief code review your branch will be tested on https://stage.olinapps.com and if nothing goes horribly wrong your changes will be merged in to master.


## Contact

Contact @EvanSimpson for questions.
