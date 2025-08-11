// add the listeners for page elements
const cityFormEl = $("#target");
const cityInputEl = $("#city-input");
const citySubmitEl = $("#city-submit");
const searchHistoryEl = $("#search-history");

// config
const APIKEY = "222033ee7e3cef36d8116bb25da24eea";
let queryURL = ``;
let currentCity = {
    lat: 0,
    lon: 0,
    name: "EnglandIsMyCity",
    date: "0000000000",
    icon: "aaa",
    temp: 0,
    wind: 0,
    humidity: 0,
    uvi: 0,
};

// state
let currentCityLat = ``;
let currentCityLon = ``;
let currentCityName = ``;
let forecastWeather = [];
let forecastLength = 5;

// grab existing search history, or an empty array if it's the user's first visit
let searchHistory = JSON.parse(localStorage.getItem("searchHistory") || "[]");

// dynamically add all items from search history to the screen
for (var i = 0; i < searchHistory.length; i++) {
    var searchHistoryItem = $('<li>')
        .text(searchHistory[i])
        .addClass('list-group-item-secondary text-center');
    searchHistoryEl.append(searchHistoryItem);
}

// when the user submits their city, use the inputted text to create the api call
// and also store that value to the searchHistory at the same time, then pull the weather.
cityFormEl.submit((event) => {
    let userCity = '';
    event.preventDefault();
    if ($(cityInputEl).val() !== '') {
        userCity = $(cityInputEl).val();
        storeSearchHistory(userCity);
        queryURL = `https://api.openweathermap.org/data/2.5/weather?q=${userCity}&units=imperial&appid=${APIKEY}`;
        pullCityWeatherData();
    };
});

// use the weather api to get the city's current weather,
// and use the geo coordinates to call the onecall api for 5-day forecast afterwards
const pullCityWeatherData = () => {

    // ensure that any previous weather data is cleared before pulling new data
    forecastWeather = [];

    fetch(queryURL).then(response =>
        response.json().then(data => ({
            data: data,
            status: response.status
        })).then(res => {
            if (res.status === 200) {
                // basic identity/coords are still handy to keep
                currentCity.lat = res.data.coord.lat;
                currentCity.lon = res.data.coord.lon;
                currentCity.name = res.data.name;

                // populate "today" from /weather
                currentCity.date = new Date(res.data.dt * 1000).toLocaleDateString('en-US');
                currentCity.icon = res.data.weather && res.data.weather[0] ? res.data.weather[0].icon : '';
                currentCity.temp = res.data.main ? res.data.main.temp : 0;
                currentCity.wind = res.data.wind ? res.data.wind.speed : 0;
                currentCity.humidity = res.data.main ? res.data.main.humidity : 0;

                // /weather does not include UV index
                currentCity.uvi = null;

                // render the big light-blue panel
                loadCurrentWeather();

                // now fetch and render the 5-day forecast
                pullFiveDayForecast();

                // If you still want a forecast later, call another endpoint (e.g. /forecast) here.
            } else {
                console.log(`An error occurred. Status: ${res.status}`);
            }
        }));
}


const pullCoordWeatherData = () => {

    fetch(queryURL).then(response =>
        response.json().then(data => ({
            data: data,
            status: response.status
        })).then(res => {
            if (res.status === 200) {

                // grab the required data from the response object
                currentCity.date = new Date(res.data.current.dt * 1000).toLocaleDateString('en-US');
                currentCity.uvi = res.data.current.uvi;
                currentCity.temp = res.data.current.temp;
                currentCity.wind = res.data.current.wind_speed;
                currentCity.humidity = res.data.current.humidity;
                currentCity.icon = res.data.current.weather[0].icon;

                loadCurrentWeather();

                for (var i = 1; i < forecastLength + 1; i++) {
                    // start with a fresh object each iteration
                    let nextWeatherForcast = {};

                    // take everything needed from the response and store it
                    Object.assign(nextWeatherForcast, {
                        date: new Date(res.data.daily[i].dt * 1000).toLocaleDateString('en-US', {
                            month: 'numeric',
                            day: 'numeric'
                        }),
                        icon: res.data.daily[i].weather[0].icon,
                        temp: res.data.daily[i].temp.max,
                        wind: res.data.daily[i].wind_speed,
                        humi: res.data.daily[i].humidity,
                    });

                    // lastly, push that object to the array and repeat for all cards
                    forecastWeather.push(nextWeatherForcast);
                }

                loadFiveDayWeather();
            } else {
                console.log(`An error occurred. Status: ${res.status}`);
                console.log(`Error: ${res.data.message}`)
                console.log(`URL: ${queryURL}`);
            }
        }));
}

const storeSearchHistory = (userSearchQuery) => {

    searchHistory.push(userSearchQuery);

    // set the local storage to include the new score
    localStorage.setItem("searchHistory", JSON.stringify(searchHistory));
}

const loadCurrentWeather = () => {
    const currentWeatherEl = $("#right-div");
    currentWeatherEl.empty();

    // only compute a UV color if we actually have a number
    let uvDiv = null;
    if (typeof currentCity.uvi === 'number') {
        let uvIndexCondition = 'green';
        if (currentCity.uvi >= 8) uvIndexCondition = 'darkorchid';
        else if (currentCity.uvi >= 6) uvIndexCondition = 'red';
        else if (currentCity.uvi >= 3) uvIndexCondition = 'darkorange';

        uvDiv = $('<div><p></p></div>')
            .attr('style', `background-color: ${uvIndexCondition}; width: max-content; padding: 0 5px;`)
            .find('p')
            .text(`UV Index: ${currentCity.uvi}`)
            .attr('style', 'color: white;')
            .end();
    }

    const date = $('<h1>')
        .text(`${currentCity.name} (${currentCity.date})`).attr('style', 'display:inline');
    const icon = $('<img>')
        .attr('src', `https://openweathermap.org/img/wn/${currentCity.icon}@2x.png`);
    const temp = $('<p>')
        .text(`Temp: ${currentCity.temp}°F`);
    const wind = $('<p>')
        .text(`Wind Speed: ${currentCity.wind} MPH`);
    const humi = $('<p>')
        .text(`Humidity: ${currentCity.humidity}%`);

    currentWeatherEl
        .append(date)
        .append(icon)
        .append(temp)
        .append(wind)
        .append(humi);

    if (uvDiv) currentWeatherEl.append(uvDiv);
};

const pullFiveDayForecast = () => {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${currentCity.lat}&lon=${currentCity.lon}&units=imperial&appid=${APIKEY}`;

    fetch(url)
        .then(r => r.json())
        .then(res => {
            if (res.cod !== "200") {
                console.log("Forecast error:", res);
                return;
            }

            const tz = res.city.timezone || 0; // seconds offset from UTC
            const buckets = {};                 // YYYY-M-D -> array of 3h items

            res.list.forEach(item => {
                const local = new Date((item.dt + tz) * 1000);
                const key = `${local.getUTCFullYear()}-${local.getUTCMonth() + 1}-${local.getUTCDate()}`;
                (buckets[key] ||= []).push(item);
            });

            // keys sorted chronological; first is "today" -> skip it
            const dayKeys = Object.keys(buckets).sort().slice(1, 6);

            forecastWeather = dayKeys.map(key => {
                const arr = buckets[key];

                // pick icon from the slot closest to 12:00 local
                const target = arr.reduce((best, cur) => {
                    const h = new Date((cur.dt + tz) * 1000).getUTCHours();
                    const diff = Math.abs(12 - h);
                    return !best || diff < best.diff ? { item: cur, diff } : best;
                }, null).item;

                const maxTemp = Math.max(...arr.map(x => x.main.temp_max));
                const avgWind = (arr.reduce((s, x) => s + x.wind.speed, 0) / arr.length);
                const avgHumi = Math.round(arr.reduce((s, x) => s + x.main.humidity, 0) / arr.length);

                return {
                    date: new Date((target.dt + tz) * 1000).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
                    icon: target.weather[0].icon,
                    temp: Math.round(maxTemp * 100) / 100,
                    wind: Math.round(avgWind * 100) / 100,
                    humi: avgHumi,
                };
            });

            loadFiveDayWeather();
        })
        .catch(err => console.error(err));
};

const loadFiveDayWeather = () => {
    const count = Math.min(forecastLength, forecastWeather.length);
    for (let i = 0; i < count; i++) {
        const currentCard = $(`#card-${i}`);
        currentCard.children(".card-header").text('');
        currentCard.children(".card-body").empty();

        const f = forecastWeather[i];
        currentCard.children(".card-header").append($('<h3>').text(f.date));
        currentCard.children(".card-body")
            .append($('<img>').attr("src", `https://openweathermap.org/img/wn/${f.icon}@2x.png`))
            .append($('<p>').text(`Temp: ${f.temp}°F`))
            .append($('<p>').text(`Wind: ${f.wind} MPH`))
            .append($('<p>').text(`Humidity: ${f.humi}%`));
    }
};