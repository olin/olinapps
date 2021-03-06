var fs = require('fs');
var express = require('express');
var rem = require('rem');
var skim = require('skim');

// Expand express app and helpful functions from parent.
var self = require('../app')
  , app = self.app
  , getSessionUser = self.getSessionUser;


/**
 * Routes
 */


var daynames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getMenuStream (next) {

  rem.stream('https://olindining.sodexomyway.com/dining-choices/index.html').get().pipe(skim({
    'links': {
      $query: 'ul li a',
      $value: '(attr href)'
    }
  }, function (a) {
    try {
      next(a.links);
    } catch (e) {
      console.error('UNSUCCESSFUL PARSING OF DINING MENU', e);
    }
  }));
}

var meals = [];
var nutrition = {};
getMenuStream(function (href) {
  if (!href) {
    console.error('BAD NEWS', href);
    return;
  }

  rem.stream('https://olindining.sodexomyway.com/' + href).get().pipe(skim({
    'breakfast': {
      $query: '.brk',
      $each: '(text)'
    },
    'lunch': {
      $query: '.lun',
      $each: '(text)'
    },
    'dinner': {
      $query: '.din',
      $each: '(text)'
    },
    'scripts': {
      $query: 'script',
      $each: '(text)'
    }
  }, function (res) {
    try {
      if (!res.scripts[1]) {
        console.error('No data :(');
        return;
      }

      var nut_keys = ['serv_size',
      'calories', 'fat_calories',
      'fat', 'percent_fat_dv',
      'satfat', 'percent_satfat',
      'trans_fat',
      'cholesterol', 'percent_cholesterol',
      'sodium', 'percent_sodium',
      'carbo', 'percent_carbo',
      'dfib', 'percent_dfib',
      'sugars', 'protein',
      'a', 'cp', 'up', 'ip',
      'name', 'description', 'allergen',
      'percent_vit_a_dv',
      'percent_vit_c_dv',
      'percent_calcium_dv',
      'percent_iron_dv',
      '_'];

      var nutrition_bad = eval(res.scripts[3].replace('<!--', '//') + '; aData');
      nutrition = {};
      Object.keys(nutrition_bad).forEach(function (key) {
        var a = nutrition[nutrition_bad[key][22]] = {};
        nutrition_bad[key].forEach(function (val, i) {
          a[nut_keys[i]] = val;
        })
      })

      try {
        function parse (datums) {
          var brk = [];
          var day = {};
          var cur = [];
          datums.forEach(function (b) {
            b = b.substr(1);
            if (b == 'REAKFAST' || b == 'UNCH' || b == 'INNER') {
              day = {};
              brk.push(day);
            } else {
              if (!b.match(/^[\r\n]/)) {
                cur = [];
                day[String(b.match(/^[^\r]+/)[0])] = cur;
                b = b.replace(/^[^\r]+/, '');
              }

              var name = String(b.replace(/^\s+|\s+$/g, ''));
              cur.push({
                name: name,
                nutrition: nutrition[name]
              });
            }
          });
          return brk;
        }

        // console.log(meals);

        var breakfast = parse(res.breakfast);
        var lunch = parse(res.lunch);
        var dinner = parse(res.dinner);

        for (var i = 0; i < lunch.length; i++) {
          meals.push({
            dayname: daynames[i],
            breakfast: breakfast[i],
            lunch: lunch[i],
            dinner: dinner[i]
          });
        }
      } catch (e) {
        console.log('ERROR:', e);
      }

      console.log('SUCCESSFUL PARSING OF DINING MENU');
      nutrition = JSON.parse(JSON.stringify(meals));
      meals.forEach(function (day) {
        Object.keys(day).forEach(function (ok) {
          if (typeof day[ok] == 'object') {
            Object.keys(day[ok]).forEach(function (section) {
              day[ok][section].forEach(function (meal) {
                delete meal.nutrition;
              })
            })
          }
        })
      })
    } catch (e) {
      console.error('UNSUCCESSFUL PARSING OF DINING MENU:', e);
    }
  }))
});

app.get('/dining', function (req, res) {
  getSessionUser(req, function (err, user) {
    console.log(err, user);
    res.render('dining.jade', {
      title: 'Olin Apps',
      meals: meals,
      user: user
    });
  })
})

app.get('/api/dining/olin', function (req, res) {
  res.json(meals);
})

app.get('/api/dining/olin/nutrition', function (req, res) {
  res.json(nutrition);
})
