// Add listeners for page elements
const cityFormEl = $("#target");
const cityInputEl = $("#city-input");
const citySubmitEl = $("#city-submit");
const searchHistoryEl = $("#search-history");

// Config
const API_KEY = "222033ee7e3cef36d8116bb25da24eea";
const LOCALE = "en-US";
const UV_THRESHOLD_MODERATE = 3;
const UV_THRESHOLD_HIGH = 6;
const UV_THRESHOLD_VERY_HIGH = 8;
const UV_COLOR_MAP = {
    low: "green",
    moderate: "darkorange",
    high: "red",
    veryHigh: "darkorchid",
};

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

// State
let forecastWeather = [];
let forecastLength = 5;

// Load search history from localStorage, or use an empty array if none exists
let searchHistory = JSON.parse(localStorage.getItem("searchHistory") || "[]");

// Populate the search history list on the page
for (const term of searchHistory) {
    const li = $("<li>")
        .text(term)
        .addClass("list-group-item-secondary text-center");
    searchHistoryEl.append(li);
}

// When the user submits their city, store the value in search history,
// construct the API URL, and fetch weather data
cityFormEl.submit((event) => {
    event.preventDefault();
    const userCity = cityInputEl.val();
    if (userCity) {
        storeSearchHistory(userCity);
        queryURL = `https://api.openweathermap.org/data/2.5/weather?q=${userCity}&units=imperial&appid=${API_KEY}`;
        pullCityWeatherData();
    }
});

/**
 * Fetch JSON and throw an error on non-2xx responses
 * @param {string} url
 * @returns {Promise<{data: any, status: number, ok: true}>}
 */
const fetchJson = (url) =>
    fetch(url).then((response) =>
        response
            .json()
            .then((data) => {
                if (!response.ok) {
                    const msg = (data && (data.message || data.error)) || "Request failed";
                    const err = new Error(`HTTP ${response.status}: ${msg}`);
                    err.status = response.status;
                    err.data = data;
                    err.url = url;
                    throw err;
                }
                return { data, status: response.status, ok: true };
            })
            .catch((err) => {
                console.error("[Weather] JSON parse error:", err, "URL:", url);
                throw err;
            })
    );

// Ensure a status banner exists in the DOM
const ensureStatusEl = () => {
    let el = $("#status-banner");
    if (el.length === 0) {
        el = $('<div id="status-banner"></div>').css({
            margin: "8px 0",
            padding: "6px 10px",
            borderRadius: "6px",
            display: "block"
        });
        const header = $("header.jumbotron");
        if (header.length) {
            header.after(el);
        } else {
            $("body").prepend(el);
        }
    }
    return el;
};

/**
 * Update the status banner using Bootstrap alert classes.
 * States: "loading" | "success" | "error" | "ready" (default)
 * @param {"loading"|"success"|"error"|"ready"} state
 * @param {string} [message]
 */
const updateStatusBar = (state, message) => {
    const el = ensureStatusEl();
    el.removeClass("alert alert-info alert-success alert-danger alert-secondary");
    switch (state) {
        case "loading":
            el.addClass("alert alert-info").text(message || "Loading…");
            break;
        case "success":
            el.addClass("alert alert-success").text(message || "Success.");
            break;
        case "error":
            el.addClass("alert alert-danger").text(message || "Something went wrong.");
            break;
        case "ready":
        default:
            el.addClass("alert alert-secondary").text(message || "Ready!");
            break;
    }
    el.show();
};

// Helper for creating jQuery elements with text
const makeEl = (tag, text) => $(tag).text(text);

// Returns a color name for a given UV index, or null if invalid
const getUvColor = (uvi) => {
    if (typeof uvi !== "number") return null;
    if (uvi >= UV_THRESHOLD_VERY_HIGH) return UV_COLOR_MAP.veryHigh;
    if (uvi >= UV_THRESHOLD_HIGH) return UV_COLOR_MAP.high;
    if (uvi >= UV_THRESHOLD_MODERATE) return UV_COLOR_MAP.moderate;
    return UV_COLOR_MAP.low;
};

// Creates the UV badge element, or returns null if no badge should be shown
const buildUvBadge = (uvi) => {
    const uvColor = getUvColor(uvi);
    if (!uvColor) return null;
    return $("<div><p></p></div>")
        .css({ backgroundColor: uvColor, width: "max-content", padding: "0 5px" })
        .find("p")
        .text(`UV Index: ${uvi}`)
        .css({ color: "white" })
        .end();
};

// Store a new city search in localStorage
const storeSearchHistory = (userSearchQuery) => {
    searchHistory.push(userSearchQuery);
    localStorage.setItem("searchHistory", JSON.stringify(searchHistory));
};

// Round a number to one decimal place
const round1 = (n) => Math.round(n * 10) / 10;

// Render the current weather panel
const loadCurrentWeather = () => {
    const currentWeatherEl = $("#right-div");
    currentWeatherEl.empty();

    const uvDiv = buildUvBadge(currentCity.uvi);

    const date = $("<h1>").text(`${currentCity.name} (${currentCity.date})`).attr("style", "display:inline");
    const icon = $("<img>").attr("src", `https://openweathermap.org/img/wn/${currentCity.icon}@2x.png`);
    const temp = makeEl("<p>", `Temp: ${round1(currentCity.temp)}°F`);
    const wind = makeEl("<p>", `Wind Speed: ${round1(currentCity.wind)} MPH`);
    const humidity = makeEl("<p>", `Humidity: ${currentCity.humidity}%`);

    currentWeatherEl
        .append(date)
        .append(icon)
        .append(temp)
        .append(wind)
        .append(humidity);

    if (uvDiv) currentWeatherEl.append(uvDiv);
};

// Group forecast entries into days based on the city's timezone
const bucketByLocalDay = (list, tzSeconds) => {
    const buckets = {};
    list.forEach((item) => {
        const local = new Date((item.dt + tzSeconds) * 1000);
        const key = `${local.getUTCFullYear()}-${local.getUTCMonth() + 1}-${local.getUTCDate()}`;
        if (!buckets[key]) {
            buckets[key] = [];
        }
        buckets[key].push(item);
    });
    return buckets;
};

// Pick the forecast entry closest to 12:00 local time for the day's icon.
const pickNoonEntry = (arr, tzSeconds) => {
    const chosen = arr.reduce((best, cur) => {
        const h = new Date((cur.dt + tzSeconds) * 1000).getUTCHours();
        const diff = Math.abs(12 - h);
        return !best || diff < best.diff ? { item: cur, diff } : best;
    }, null);
    return chosen ? chosen.item : arr[0];
};

// Create a single day's forecast summary from a bucket of entries.
const summarizeDay = (arr, tzSeconds) => {
    const noonItem = pickNoonEntry(arr, tzSeconds);
    const maxTemp = Math.max(...arr.map((x) => x.main.temp_max));
    const avgWind = arr.reduce((s, x) => s + x.wind.speed, 0) / arr.length;
    const avgHumidity = Math.round(arr.reduce((s, x) => s + x.main.humidity, 0) / arr.length);
    return {
        date: new Date((noonItem.dt + tzSeconds) * 1000).toLocaleDateString(LOCALE, { month: "numeric", day: "numeric" }),
        icon: noonItem.weather[0].icon,
        temp: round1(maxTemp),
        wind: round1(avgWind),
        humidity: avgHumidity,
    };
};

// Fetch the city's current weather, then load the forecast
const pullCityWeatherData = () => {
    forecastWeather = [];

    updateStatusBar("loading", "Fetching current weather…");
    fetchJson(queryURL)
        .then((res) => {
            currentCity.lat = res.data.coord.lat;
            currentCity.lon = res.data.coord.lon;
            currentCity.name = res.data.name;
            currentCity.date = new Date(res.data.dt * 1000).toLocaleDateString(LOCALE);
            currentCity.icon = res.data.weather && res.data.weather[0] ? res.data.weather[0].icon : "";
            currentCity.temp = res.data.main ? res.data.main.temp : 0;
            currentCity.wind = res.data.wind ? res.data.wind.speed : 0;
            currentCity.humidity = res.data.main ? res.data.main.humidity : 0;
            currentCity.uvi = null;

            loadCurrentWeather();
            updateStatusBar("success", `Loaded current weather for ${currentCity.name}. Fetching forecast…`);
            pullFiveDayForecast();
        })
        .catch((err) => {
            console.error("[Weather] City fetch failed:", err, "URL:", queryURL);
            updateStatusBar("error", `Could not fetch current weather. ${err.message || "Please try again."}`);
        });
};

// Fetch the city's 5-day forecast and render it
const pullFiveDayForecast = () => {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${currentCity.lat}&lon=${currentCity.lon}&units=imperial&appid=${API_KEY}`;

    updateStatusBar("loading", "Fetching 5-day forecast…");
    fetchJson(url)
        .then((res) => {
            if (!res.data || res.data.cod !== "200") {
                console.log("[Weather] Forecast error:", res);
                throw new Error(
                    `Forecast API error: ${res && res.data && res.data.message ? res.data.message : "Unknown error"}`
                );
            }
            const tz = (res.data.city && res.data.city.timezone) || 0;
            const buckets = bucketByLocalDay(res.data.list || [], tz);
            const dayKeys = Object.keys(buckets).sort().slice(1, 6);
            forecastWeather = dayKeys.map((key) => summarizeDay(buckets[key], tz));
            loadFiveDayWeather();
            updateStatusBar("ready", "Ready!");
        })
        .catch((err) => {
            console.error("[Weather] Forecast fetch failed:", err, "URL:", url);
            updateStatusBar("error", `Could not fetch forecast. ${err.message || "Please try again."}`);
        });
};

// Populate a forecast card with data for a single day
const fillForecastCard = (cardEl, day) => {
    cardEl.children(".card-header").text("");
    cardEl.children(".card-body").empty();
    cardEl.children(".card-header").append($("<h3>").text(day.date));
    cardEl
        .children(".card-body")
        .append($("<img>").attr("src", `https://openweathermap.org/img/wn/${day.icon}@2x.png`))
        .append($("<p>").text(`Temp: ${day.temp}°F`))
        .append($("<p>").text(`Wind: ${day.wind} MPH`))
        .append($("<p>").text(`Humidity: ${day.humidity}%`));
};

// Render the full set of forecast cards
const loadFiveDayWeather = () => {
    const count = Math.min(forecastLength, forecastWeather.length);
    for (let i = 0; i < count; i++) {
        const cardEl = $(`#card-${i}`);
        const day = forecastWeather[i];
        fillForecastCard(cardEl, day);
    }
};
