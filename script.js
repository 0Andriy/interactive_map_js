const API_URL = "http://localhost:3000/markers"; // Адреса API
const markersContainer = document.querySelector("#markers-container");
const form = document.querySelector("#marker-form");
const saveButton = document.querySelector("#save-marker");
const cancelButton = document.querySelector("#cancel-marker");

let selectedMarker = null;
let newMarkerPosition = { x: 0, y: 0 };

// 📌 Довідник іконок
const iconDictionary = {
    default: "icons/prickly-pear-svgrepo-com.svg",
    fire: "icons/apple-svgrepo-com.svg",
    police: "icons/beer-svgrepo-com.svg",
    hospital: "icons/chicken-svgrepo-com.svg",
};

// 📌 Завантаження міток із бази
async function loadMarkers() {
    const res = await fetch(API_URL);
    const markers = await res.json();
    markers.forEach(m => createMarker(m));
}

// 📌 Відкриття форми в місці кліку
markersContainer.addEventListener("click", (e) => {
    if (e.target !== markersContainer) return;

    const rect = markersContainer.getBoundingClientRect();
    newMarkerPosition.x = (e.clientX - rect.left) / rect.width; // Зберігання у відсотках
    newMarkerPosition.y = (e.clientY - rect.top) / rect.height; // Зберігання у відсотках

    form.style.left = `${e.clientX}px`;
    form.style.top = `${e.clientY}px`;
    form.style.display = "block";

    selectedMarker = null; // Новий маркер
});

// 📌 Збереження мітки
async function saveMarker() {
    const type = document.querySelector("#marker-type").value;
    const note = document.querySelector("#marker-note").value;
    const size = parseInt(document.querySelector("#marker-size").value);

    // 🔄 Отримання іконки з довідника або дефолтної
    const icon = iconDictionary[type] || iconDictionary.default;

    if (selectedMarker) {
        // // 📝 Оновлення існуючої мітки
        // await fetch(`${API_URL}/${selectedMarker.dataset.id}`, {
        //     method: "PUT",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({
        //         x: parseFloat(selectedMarker.dataset.x),
        //         y: parseFloat(selectedMarker.dataset.y),
        //         type, note, icon, size
        //     }),
        // });

        selectedMarker.dataset.type = type;
        selectedMarker.dataset.note = note;
        selectedMarker.dataset.icon = icon;
        selectedMarker.dataset.size = size;
        selectedMarker.querySelector("img").src = icon;
        selectedMarker.querySelector("img").style.width = `${size}px`;
        selectedMarker.querySelector("img").style.height = `${size}px`;
    } else {
        // // 🆕 Створення нової мітки
        // const res = await fetch(API_URL, {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({ 
        //         x: newMarkerPosition.x, 
        //         y: newMarkerPosition.y, 
        //         type, note, icon, size 
        //     }),
        // });

        // const newMarker = await res.json();

        const newMarker = {
            id: Date.now(),
            x: newMarkerPosition.x,
            y: newMarkerPosition.y,
            type, note, icon, size
        };
        createMarker(newMarker);
    }

    form.style.display = "none";
}

// 📌 Створення мітки на карті
function createMarker({ id, x, y, type, note, icon, size }) {
    const marker = document.createElement("div");
    marker.classList.add("marker");
    marker.style.position = "absolute"; // Додано для абсолютного позиціонування
    marker.style.left = `${x * 100}%`;
    marker.style.top = `${y * 100}%`;
    marker.dataset.id = id;
    marker.dataset.x = x; // Відсоток по X
    marker.dataset.y = y; // Відсоток по Y
    marker.dataset.type = type;
    marker.dataset.note = note;
    marker.dataset.icon = icon;
    marker.dataset.size = size;
    marker.draggable = true;

    const img = document.createElement("img");
    img.src = icon;
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    marker.appendChild(img);

    // 📝 Подвійний клік — відкриття форми редагування
    marker.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        selectedMarker = marker;
        document.querySelector("#marker-type").value = marker.dataset.type;
        document.querySelector("#marker-note").value = marker.dataset.note;
        document.querySelector("#marker-size").value = marker.dataset.size;
        
        form.style.left = `${e.clientX}px`;
        form.style.top = `${e.clientY}px`;
        form.style.display = "block";
    });

    // 🎯 Перетягування мітки
    marker.addEventListener("mousedown", (e) => {
        const offsetX = e.clientX - marker.offsetLeft; //marker.getBoundingClientRect().left; 
        const offsetY = e.clientY - marker.offsetTop; //marker.getBoundingClientRect().top; 

        function onMouseMove(event) {
            const x = (event.clientX - offsetX) / markersContainer.clientWidth;
            const y = (event.clientY - offsetY) / markersContainer.clientHeight;
            
            marker.style.cursor = "grabbing";
            marker.style.left = `${x * 100}%`;
            marker.style.top = `${y * 100}%`;
            marker.dataset.x = x;
            marker.dataset.y = y;
        }

        function onMouseUp() {
            marker.style.cursor = "pointer";
            marker.ondragstart = null; // 🚫 Відновлення перетягування

            markersContainer.removeEventListener("mousemove", onMouseMove);
            markersContainer.removeEventListener("mouseup", onMouseUp);

            // // 📌 Оновлення координат у базі після переміщення
            // fetch(`${API_URL}/${marker.dataset.id}`, {
            //     method: "PATCH",
            //     headers: { "Content-Type": "application/json" },
            //     body: JSON.stringify({ x: parseFloat(marker.dataset.x), y: parseFloat(marker.dataset.y) }),
            // });
        }

        markersContainer.addEventListener("mousemove", onMouseMove);
        markersContainer.addEventListener("mouseup", onMouseUp);

        // 🚫 Заборона виділення тексту під час перетягування
        marker.ondragstart = function() {
            return false;
        };
    });

    markersContainer.appendChild(marker);
}

// 🎯 Обробники кнопок форми
saveButton.addEventListener("click", saveMarker);
cancelButton.addEventListener("click", () => form.style.display = "none");

// 🚀 Завантаження міток при старті
// loadMarkers();

// 📌 Оновлення позицій міток при зміні розміру вікна
function updateMarkerPositions() {
    const markers = document.querySelectorAll(".marker");
    markers.forEach(marker => {
        const x = parseFloat(marker.dataset.x);
        const y = parseFloat(marker.dataset.y);
        marker.style.left = `${x * 100}%`;
        marker.style.top = `${y * 100}%`;
    });
}

// 📏 Відстеження зміни розміру вікна
window.addEventListener('resize', updateMarkerPositions);
