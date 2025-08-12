// add the listeners for page elements
const cityFormEl = $("#target");
const cityInputEl = $("#city-input");
const citySubmitEl = $("#city-submit");
const searchHistoryEl = $("#search-history");

// config
const API_KEY = "222033ee7e3cef36d8116bb25da24eea";
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
let forecastWeather = [];
let forecastLength = 5;

// grab existing search history, or an empty array if it's the user's first visit
let searchHistory = JSON.parse(localStorage.getItem("searchHistory") || "[]");

// dynamically add all items from search history to the screen
for (const term of searchHistory) {
    const li = $('<li>')
        .text(term)
        .addClass('list-group-item-secondary text-center');
    searchHistoryEl.append(li);
}

// when the user submits their city, use the inputted text to create the api call
// and also store that value to the searchHistory at the same time, then pull the weather.
cityFormEl.submit((event) => {
    event.preventDefault();
    const userCity = cityInputEl.val();
    if (userCity) {
        storeSearchHistory(userCity);
        queryURL = `https://api.openweathermap.org/data/2.5/weather?q=${userCity}&units=imperial&appid=${API_KEY}`;
        pullCityWeatherData();
    }
});

// helper for consistent fetch + JSON + status handling
const fetchJson = (url) =>
    fetch(url).then(response =>
        response.json()
            .then(data => ({ data, status: response.status }))
            .catch(err => {
                console.error('JSON parse error:', err, 'URL:', url);
                throw err;
            })
    );

// helper to map UV index to a color
const getUvColor = (uvi) => {
    if (typeof uvi !== 'number') return null;
    if (uvi >= 8) return 'darkorchid';
    if (uvi >= 6) return 'red';
    if (uvi >= 3) return 'darkorange';
    return 'green';
};

// use the weather api to get the city's current weather,
// and use the geo coordinates to call the onecall api for 5-day forecast afterwards
const pullCityWeatherData = () => {
    // ensure that any previous weather data is cleared before pulling new data
    forecastWeather = [];

    fetchJson(queryURL)
        .then(res => {
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
        })
        .catch(err => {
            console.error('City weather fetch failed:', err, 'URL:', queryURL);
        });
};

const storeSearchHistory = (userSearchQuery) => {
    searchHistory.push(userSearchQuery);
    // update local storage to include the new search term
    localStorage.setItem("searchHistory", JSON.stringify(searchHistory));
};

const loadCurrentWeather = () => {
    const currentWeatherEl = $("#right-div");
    currentWeatherEl.empty();

    const uvColor = getUvColor(currentCity.uvi);
    const uvDiv = uvColor
        ? $('<div><p></p></div>')
            .attr('style', `background-color: ${uvColor}; width: max-content; padding: 0 5px;`)
            .find('p')
            .text(`UV Index: ${currentCity.uvi}`)
            .attr('style', 'color: white;')
            .end()
        : null;

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
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${currentCity.lat}&lon=${currentCity.lon}&units=imperial&appid=${API_KEY}`;

    fetchJson(url)
        .then(res => {
            // res.data because fetchJson returns {data, status}
            if (!res.data || res.data.cod !== "200") {
                console.log("Forecast error:", res);
                return;
            }

            const tz = (res.data.city && res.data.city.timezone) || 0; // seconds offset from UTC
            const buckets = {};                 // YYYY-M-D -> array of 3h items

            res.data.list.forEach(item => {
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
                    humidity: avgHumi,
                };
            });

            loadFiveDayWeather();
        })
        .catch(err => console.error(err));
};

const loadFiveDayWeather = () => {
    const count = Math.min(forecastLength, forecastWeather.length);
    for (let i = 0; i < count; i++) {
        const cardEl = $(`#card-${i}`);
        cardEl.children(".card-header").text('');
        cardEl.children(".card-body").empty();

        const day = forecastWeather[i];
        cardEl.children(".card-header").append($('<h3>').text(day.date));
        cardEl.children(".card-body")
            .append($('<img>').attr("src", `https://openweathermap.org/img/wn/${day.icon}@2x.png`))
            .append($('<p>').text(`Temp: ${day.temp}°F`))
            .append($('<p>').text(`Wind: ${day.wind} MPH`))
            .append($('<p>').text(`Humidity: ${day.humidity}%`));
    }
};
