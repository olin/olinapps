# olinapps

## Sections

### apps/launchpad.js

This is a static list of websites, all searching is done client-side. You can edit the views/launchpad.jade file to add/change links.

### apps/printers.js

This is a list of printers, regenerated using the `tools/update_printers.sh` script, saved in `data/printers.txt`.

### apps/dining.js

This is a dining hall API. A separate Heroku instance should poll the `/dining/update` route every ten minutes as a cron job.

## Contact

Contact @tcr for questions.