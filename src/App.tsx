import { useState } from 'react';

const arduinoCode = `/*
 * ============================================
 *   АРДУИНО ЦВЕТОМУЗЫКА
 *   Анализ частот и управление LED лентами
 * ============================================
 * 
 * Описание:
 *   Скетч анализирует входящий аудиосигнал
 *   с помощью FFT и разделяет спектр на
 *   6 частотных диапазонов. Каждый диапазон
 *   управляет своей светодиодной лентой.
 * 
 * Компоненты:
 *   - Arduino Uno / Nano
 *   - Микрофонный модуль (MAX9812 / MAX4466)
 *   - 6x MOSFET транзисторов (IRLZ44N / IRF520)
 *   - 6x LED лент (12V)
 *   - Блок питания 12V
 * 
 * Подключение:
 *   A0 - аналоговый вход с микрофона
 *   D3  - Bass (20-60 Hz)     - Красная лента
 *   D5  - Low-Mid (60-250 Hz) - Оранжевая лента
 *   D6  - Mid (250-500 Hz)    - Жёлтая лента
 *   D9  - Upper-Mid (500-2kHz)- Зелёная лента
 *   D10 - High (2k-4kHz)      - Синяя лента
 *   D11 - Ultra-High (4k-8kHz)- Фиолетовая лента
 * 
 * Библиотека:
 *   ArduinoFFT - https://github.com/kosme/arduinoFFT
 */

#include <arduinoFFT.h>

// ========== НАСТРОЙКИ ==========
#define SAMPLES         128        // Количество сэмплов FFT (степень 2)
#define SAMPLING_FREQ   8000       // Частота дискретизации (Гц)
#define ANALOG_PIN      A0         // Пин микрофона
#define NOISE_GATE      50         // Порог шумоподавления

// Частотные диапазоны (индексы бинов FFT)
// Бин = частота / (SAMPLING_FREQ / SAMPLES)
// Разрешение по частоте = 8000/128 = 62.5 Гц/бин
#define BASS_MIN        0          // 20-60 Hz
#define BASS_MAX        1
#define LOWMID_MIN      1          // 60-250 Hz
#define LOWMID_MAX      4
#define MID_MIN         4          // 250-500 Hz
#define MID_MAX         8
#define UPMID_MIN       8          // 500-2000 Hz
#define UPMID_MAX       32
#define HIGH_MIN        32         // 2000-4000 Hz
#define HIGH_MAX        64
#define ULTRA_MIN       64         // 4000-8000 Hz
#define ULTRA_MAX       127

// PWM выходы для LED лент
#define LED_BASS        3          // Bass - Красный
#define LED_LOWMID      5          // Low-Mid - Оранжевый
#define LED_MID         6          // Mid - Жёлтый
#define LED_UPMID       9          // Upper-Mid - Зелёный
#define LED_HIGH        10         // High - Синий
#define LED_ULTRA       11         // Ultra-High - Фиолетовый

// Параметры сглаживания
#define SMOOTHING       0.7        // Коэффициент сглаживания (0-1)
#define DECAY_RATE      3          // Скорость затухания

// ========== ПЕРЕМЕННЫЕ ==========
double vReal[SAMPLES];
double vImag[SAMPLES];
unsigned long samplingPeriod;
unsigned long startTime;

ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, SAMPLES, SAMPLING_FREQ);

// Текущие и целевые значения яркости
uint8_t currentBrightness[6] = {0};
uint8_t targetBrightness[6] = {0};

// Пины LED
const uint8_t ledPins[6] = {
  LED_BASS, LED_LOWMID, LED_MID,
  LED_UPMID, LED_HIGH, LED_ULTRA
};

// Границы диапазонов
const uint8_t bandMin[6] = {
  BASS_MIN, LOWMID_MIN, MID_MIN,
  UPMID_MIN, HIGH_MIN, ULTRA_MIN
};
const uint8_t bandMax[6] = {
  BASS_MAX, LOWMID_MAX, MID_MAX,
  UPMID_MAX, HIGH_MAX, ULTRA_MAX
};

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  
  // Настройка PWM выходов
  for (int i = 0; i < 6; i++) {
    pinMode(ledPins[i], OUTPUT);
    analogWrite(ledPins[i], 0);
  }
  
  // Настройка аналогового входа
  pinMode(ANALOG_PIN, INPUT);
  
  // Расчёт периода дискретизации
  samplingPeriod = round(1000000.0 / SAMPLING_FREQ);
  
  Serial.println(F("=== Цветомузыка запущена ==="));
  Serial.print(F("Разрешение FFT: "));
  Serial.print((float)SAMPLING_FREQ / SAMPLES);
  Serial.println(F(" Hz/bin"));
}

// ========== ОСНОВНОЙ ЦИКЛ ==========
void loop() {
  // 1. Считываем сэмплы
  sampleAudio();
  
  // 2. Выполняем FFT
  performFFT();
  
  // 3. Вычисляем энергию каждого диапазона
  calculateBands();
  
  // 4. Сглаживаем и обновляем яркость LED
  updateLEDs();
  
  // 5. Вывод отладки (раскомментировать при необходимости)
  // printDebug();
}

// ========== ФУНКЦИИ ==========

// Считывание аудиосэмплов
void sampleAudio() {
  for (int i = 0; i < SAMPLES; i++) {
    startTime = micros();
    
    vReal[i] = analogRead(ANALOG_PIN);
    vImag[i] = 0.0;
    
    // Точная задержка для равномерной дискретизации
    while (micros() - startTime < samplingPeriod) {
      // ждём
    }
  }
}

// Выполнение FFT
void performFFT() {
  // Оконная функция (Hann) для уменьшения утечек
  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  
  // Вычисление FFT
  FFT.compute(FFT_FORWARD);
  
  // Вычисление магнитуд
  FFT.complexToMagnitude();
}

// Вычисление энергии каждого частотного диапазона
void calculateBands() {
  for (int band = 0; band < 6; band++) {
    double sum = 0;
    int count = 0;
    
    // Суммируем энергию бинов в диапазоне
    for (int bin = bandMin[band]; bin <= bandMax[band]; bin++) {
      sum += vReal[bin];
      count++;
    }
    
    // Средняя энергия в диапазоне
    double avg = (count > 0) ? sum / count : 0;
    
    // Шумоподавление
    if (avg < NOISE_GATE) {
      targetBrightness[band] = 0;
    } else {
      // Масштабирование в диапазон 0-255
      double scaled = avg / 4.0;  // Коэффициент усиления
      if (scaled > 255) scaled = 255;
      targetBrightness[band] = (uint8_t)scaled;
    }
  }
}

// Обновление яркости LED с плавным переходом
void updateLEDs() {
  for (int i = 0; i < 6; i++) {
    // Плавное приближение к целевому значению
    if (currentBrightness[i] < targetBrightness[i]) {
      // Нарастание (быстрее)
      currentBrightness[i] = currentBrightness[i] + 
        (targetBrightness[i] - currentBrightness[i]) * (1.0 - SMOOTHING * 0.5);
    } else if (currentBrightness[i] > targetBrightness[i]) {
      // Затухание (медленнее)
      if (currentBrightness[i] > DECAY_RATE) {
        currentBrightness[i] -= DECAY_RATE;
      } else {
        currentBrightness[i] = 0;
      }
    }
    
    // Обновляем PWM
    analogWrite(ledPins[i], currentBrightness[i]);
  }
}

// Отладочный вывод
void printDebug() {
  Serial.print(F("Bass:"));
  Serial.print(currentBrightness[0]);
  Serial.print(F(" LowMid:"));
  Serial.print(currentBrightness[1]);
  Serial.print(F(" Mid:"));
  Serial.print(currentBrightness[2]);
  Serial.print(F(" UpMid:"));
  Serial.print(currentBrightness[3]);
  Serial.print(F(" High:"));
  Serial.print(currentBrightness[4]);
  Serial.print(F(" Ultra:"));
  Serial.println(currentBrightness[5]);
}`;

// Компонент с подсветкой синтаксиса
function CodeBlock({ code }: { code: string }) {
  const highlightLine = (line: string) => {
    // Комментарии
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || 
        line.trim().startsWith('/*') || line.trim().startsWith('*/')) {
      return <span className="text-gray-500 italic">{line}</span>;
    }
    
    // Препроцессор
    if (line.trim().startsWith('#')) {
      return <span className="text-purple-400">{line}</span>;
    }
    
    // Подсветка ключевых слов
    let result = line;
    const keywords = ['void', 'int', 'uint8_t', 'double', 'const', 'for', 'if', 'else', 'while', 'return', 'unsigned', 'long'];
    const functions = ['setup', 'loop', 'pinMode', 'analogWrite', 'analogRead', 'Serial', 'FFT', 'micros', 'round', 'OUTPUT', 'INPUT'];
    
    // Простая подсветка
    const parts: JSX.Element[] = [];
    let remaining = result;
    let key = 0;
    
    // Разделяем на части
    const tokens = remaining.split(/(\s+|[(){};,=<>+\-*/]|"[^"]*")/);
    
    for (const token of tokens) {
      if (keywords.includes(token)) {
        parts.push(<span key={key++} className="text-blue-400 font-bold">{token}</span>);
      } else if (functions.includes(token)) {
        parts.push(<span key={key++} className="text-yellow-300">{token}</span>);
      } else if (/^\d+\.?\d*$/.test(token)) {
        parts.push(<span key={key++} className="text-green-400">{token}</span>);
      } else if (token.startsWith('"') || token.startsWith('F("')) {
        parts.push(<span key={key++} className="text-orange-300">{token}</span>);
      } else if (token.startsWith("'")) {
        parts.push(<span key={key++} className="text-orange-300">{token}</span>);
      } else {
        parts.push(<span key={key++}>{token}</span>);
      }
    }
    
    return <>{parts}</>;
  };

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700 shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="w-3 h-3 rounded-full bg-red-500"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="ml-3 text-gray-400 text-sm font-mono">color_music.ino</span>
      </div>
      <div className="overflow-x-auto p-4">
        <pre className="text-sm leading-relaxed">
          <code>
            {code.split('\n').map((line, i) => (
              <div key={i} className="flex">
                <span className="text-gray-600 select-none w-10 text-right mr-4 flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-gray-200">{highlightLine(line)}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

// Схема подключения
function WiringDiagram() {
  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 shadow-2xl">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span className="text-2xl">🔌</span> Схема подключения
      </h3>
      <svg viewBox="0 0 800 500" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        {/* Arduino */}
        <rect x="300" y="150" width="200" height="300" rx="10" fill="#1a5276" stroke="#2980b9" strokeWidth="2"/>
        <text x="400" y="185" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">ARDUINO UNO</text>
        
        {/* USB */}
        <rect x="370" y="430" width="60" height="20" rx="3" fill="#333" stroke="#555"/>
        <text x="400" y="445" textAnchor="middle" fill="#aaa" fontSize="8">USB</text>
        
        {/* Pins */}
        <circle cx="320" cy="220" r="5" fill="#e74c3c"/>
        <text x="335" y="224" fill="#e74c3c" fontSize="10">A0</text>
        
        <circle cx="320" cy="260" r="5" fill="#2ecc71"/>
        <text x="335" y="264" fill="#2ecc71" fontSize="10">D3</text>
        
        <circle cx="320" cy="290" r="5" fill="#2ecc71"/>
        <text x="335" y="294" fill="#2ecc71" fontSize="10">D5</text>
        
        <circle cx="320" cy="320" r="5" fill="#2ecc71"/>
        <text x="335" y="324" fill="#2ecc71" fontSize="10">D6</text>
        
        <circle cx="320" cy="350" r="5" fill="#2ecc71"/>
        <text x="335" y="354" fill="#2ecc71" fontSize="10">D9</text>
        
        <circle cx="320" cy="380" r="5" fill="#2ecc71"/>
        <text x="335" y="384" fill="#2ecc71" fontSize="10">D10</text>
        
        <circle cx="320" cy="410" r="5" fill="#2ecc71"/>
        <text x="335" y="414" fill="#2ecc71" fontSize="10">D11</text>
        
        {/* GND & 5V */}
        <circle cx="480" cy="220" r="5" fill="#333"/>
        <text x="465" y="224" textAnchor="end" fill="#aaa" fontSize="10">GND</text>
        
        <circle cx="480" cy="250" r="5" fill="#f39c12"/>
        <text x="465" y="254" textAnchor="end" fill="#f39c12" fontSize="10">5V</text>
        
        {/* Микрофон */}
        <rect x="50" y="180" width="120" height="80" rx="8" fill="#2c3e50" stroke="#3498db" strokeWidth="2"/>
        <text x="110" y="210" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">MIC MODULE</text>
        <text x="110" y="230" textAnchor="middle" fill="#3498db" fontSize="9">MAX9812</text>
        <text x="110" y="248" textAnchor="middle" fill="#aaa" fontSize="8">OUT → A0</text>
        
        {/* Линия от микрофона к A0 */}
        <line x1="170" y1="220" x2="315" y2="220" stroke="#e74c3c" strokeWidth="2" strokeDasharray="5,3"/>
        
        {/* MOSFET + LED ленты */}
        {[
          { y: 260, color: '#e74c3c', label: 'BASS (Red)', pin: 'D3' },
          { y: 290, color: '#e67e22', label: 'LOW-MID (Orange)', pin: 'D5' },
          { y: 320, color: '#f1c40f', label: 'MID (Yellow)', pin: 'D6' },
          { y: 350, color: '#2ecc71', label: 'UP-MID (Green)', pin: 'D9' },
          { y: 380, color: '#3498db', label: 'HIGH (Blue)', pin: 'D10' },
          { y: 410, color: '#9b59b6', label: 'ULTRA (Violet)', pin: 'D11' },
        ].map((led, i) => (
          <g key={i}>
            {/* MOSFET */}
            <rect x="170" y={led.y - 12} width="40" height="24" rx="4" fill="#34495e" stroke={led.color} strokeWidth="1.5"/>
            <text x="190" y={led.y + 4} textAnchor="middle" fill={led.color} fontSize="7">MOSFET</text>
            
            {/* LED strip */}
            <rect x="60" y={led.y - 10} width="90" height="20" rx="4" fill={led.color} opacity="0.3" stroke={led.color} strokeWidth="1.5"/>
            <text x="105" y={led.y + 4} textAnchor="middle" fill={led.color} fontSize="8" fontWeight="bold">{led.label}</text>
            
            {/* Линии */}
            <line x1="210" y1={led.y} x2="315" y2={led.y} stroke={led.color} strokeWidth="1.5" strokeDasharray="4,2"/>
            <line x1="150" y1={led.y} x2="170" y2={led.y} stroke={led.color} strokeWidth="1.5"/>
          </g>
        ))}
        
        {/* Блок питания */}
        <rect x="50" y="430" width="120" height="50" rx="8" fill="#1a1a2e" stroke="#e74c3c" strokeWidth="2"/>
        <text x="110" y="455" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">PSU 12V</text>
        <text x="110" y="470" textAnchor="middle" fill="#aaa" fontSize="9">→ LED strips</text>
        
        {/* Заголовок */}
        <text x="400" y="30" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">СХЕМА ПОДКЛЮЧЕНИЯ</text>
        <text x="400" y="50" textAnchor="middle" fill="#aaa" fontSize="11">Arduino + Микрофон + 6 LED лент через MOSFET</text>
        
        {/* Легенда */}
        <rect x="550" y="150" width="230" height="200" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)"/>
        <text x="665" y="175" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">Частотные диапазоны:</text>
        <text x="570" y="200" fill="#e74c3c" fontSize="10">● Bass: 20-60 Hz</text>
        <text x="570" y="220" fill="#e67e22" fontSize="10">● Low-Mid: 60-250 Hz</text>
        <text x="570" y="240" fill="#f1c40f" fontSize="10">● Mid: 250-500 Hz</text>
        <text x="570" y="260" fill="#2ecc71" fontSize="10">● Upper-Mid: 500-2kHz</text>
        <text x="570" y="280" fill="#3498db" fontSize="10">● High: 2k-4kHz</text>
        <text x="570" y="300" fill="#9b59b6" fontSize="10">● Ultra-High: 4k-8kHz</text>
        <text x="570" y="330" fill="#aaa" fontSize="9">FFT: 128 samples @ 8kHz</text>
        <text x="570" y="345" fill="#aaa" fontSize="9">Resolution: 62.5 Hz/bin</text>
      </svg>
    </div>
  );
}

// Визуализатор спектра (демо)
function SpectrumVisualizer() {
  const [bars, setBars] = useState<number[]>(Array(32).fill(0));
  const [isAnimating, setIsAnimating] = useState(true);
  
  useState(() => {
    const interval = setInterval(() => {
      if (isAnimating) {
        setBars(prev => prev.map((_, i) => {
          const base = Math.sin(Date.now() / 500 + i * 0.5) * 50 + 50;
          const noise = Math.random() * 30;
          return Math.min(100, Math.max(5, base + noise - i * 1.5));
        }));
      }
    }, 100);
    return () => clearInterval(interval);
  });

  const colors = [
    'from-red-500 to-red-600',
    'from-red-500 to-orange-500',
    'from-orange-400 to-orange-500',
    'from-yellow-400 to-yellow-500',
    'from-yellow-400 to-green-400',
    'from-green-400 to-green-500',
    'from-green-400 to-teal-400',
    'from-teal-400 to-cyan-400',
    'from-cyan-400 to-blue-400',
    'from-blue-400 to-blue-500',
    'from-blue-500 to-indigo-500',
    'from-indigo-400 to-purple-500',
    'from-purple-400 to-purple-500',
    'from-purple-500 to-pink-500',
  ];

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-2xl">🎵</span> Демонстрация работы
        </h3>
        <button 
          onClick={() => setIsAnimating(!isAnimating)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            isAnimating 
              ? 'bg-red-500/20 text-red-400 border border-red-500/50' 
              : 'bg-green-500/20 text-green-400 border border-green-500/50'
          }`}
        >
          {isAnimating ? '⏸ Пауза' : '▶ Старт'}
        </button>
      </div>
      <div className="flex items-end gap-1 h-48 bg-gray-800 rounded-lg p-4">
        {bars.map((height, i) => (
          <div
            key={i}
            className={`flex-1 bg-gradient-to-t ${colors[i % colors.length]} rounded-t-sm transition-all duration-100 opacity-80 hover:opacity-100`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>20 Hz</span>
        <span>60 Hz</span>
        <span>250 Hz</span>
        <span>500 Hz</span>
        <span>2 kHz</span>
        <span>4 kHz</span>
        <span>8 kHz</span>
      </div>
      <div className="flex justify-between mt-1">
        {['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'].map((emoji, i) => (
          <span key={i} className="text-lg">{emoji}</span>
        ))}
      </div>
    </div>
  );
}

// Список компонентов
function ComponentsList() {
  const components = [
    { name: 'Arduino Uno / Nano', qty: '1', desc: 'Микроконтроллер', icon: '🔧' },
    { name: 'Микрофон MAX9812', qty: '1', desc: 'Модуль с усилителем', icon: '🎤' },
    { name: 'MOSFET IRLZ44N', qty: '6', desc: 'N-канальный, логический', icon: '⚡' },
    { name: 'Резистор 220Ω', qty: '6', desc: 'Gate резистор', icon: '🔴' },
    { name: 'Резистор 10kΩ', qty: '6', desc: 'Pull-down для Gate', icon: '🟤' },
    { name: 'LED лента 12V', qty: '6', desc: 'Разные цвета', icon: '💡' },
    { name: 'Блок питания 12V 5A', qty: '1', desc: 'Для LED лент', icon: '🔋' },
    { name: 'Провода, макетная плата', qty: '-', desc: 'Для монтажа', icon: '🔗' },
  ];

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 shadow-2xl">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span className="text-2xl">🛒</span> Необходимые компоненты
      </h3>
      <div className="grid gap-3">
        {components.map((comp, i) => (
          <div key={i} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-500 transition-colors">
            <span className="text-2xl">{comp.icon}</span>
            <div className="flex-1">
              <div className="text-white font-medium text-sm">{comp.name}</div>
              <div className="text-gray-400 text-xs">{comp.desc}</div>
            </div>
            <div className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs font-mono">
              ×{comp.qty}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Главная страница
export default function App() {
  const [activeTab, setActiveTab] = useState<'code' | 'scheme' | 'demo'>('code');
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(arduinoCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl">
              🎶
            </div>
            <div>
              <h1 className="text-lg font-bold">Arduino Цветомузыка</h1>
              <p className="text-xs text-gray-400">FFT анализ + LED управление</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a 
              href="https://github.com/kosme/arduinoFFT" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors flex items-center gap-2"
            >
              <span>📚</span> ArduinoFFT
            </a>
            <button
              onClick={copyCode}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                copied 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                  : 'bg-purple-500/20 text-purple-400 border border-purple-500/50 hover:bg-purple-500/30'
              }`}
            >
              {copied ? '✓ Скопировано!' : '📋 Копировать код'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent">
            Цветомузыка на Arduino
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Аудио-визуализатор с FFT анализом. 6 частотных диапазонов управляют 
            светодиодными лентами через MOSFET транзисторы.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            {['FFT 128 точек', '6 каналов', '8kHz сэмплирование', 'PWM управление', 'Шумоподавление'].map(tag => (
              <span key={tag} className="px-3 py-1 bg-gray-800 border border-gray-700 rounded-full text-xs text-gray-300">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-2 mb-8">
          {[
            { id: 'code' as const, label: '💻 Код скетча', icon: '' },
            { id: 'scheme' as const, label: '🔌 Схема', icon: '' },
            { id: 'demo' as const, label: '🎵 Демо', icon: '' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-lg shadow-purple-500/10'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-8">
          {activeTab === 'code' && (
            <>
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <CodeBlock code={arduinoCode} />
                </div>
                <div className="space-y-6">
                  <ComponentsList />
                </div>
              </div>
              
              {/* Описание работы */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">📖</span> Как это работает
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <h4 className="text-purple-400 font-bold mb-2">1. Сэмплирование</h4>
                      <p className="text-gray-400 text-sm">
                        Аналоговый сигнал с микрофона считывается 128 раз с частотой 8kHz. 
                        Это даёт разрешение 62.5 Гц на каждый бин FFT.
                      </p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <h4 className="text-blue-400 font-bold mb-2">2. FFT анализ</h4>
                      <p className="text-gray-400 text-sm">
                        Быстрое преобразование Фурье раскладывает сигнал на частотные 
                        составляющие. Применяется окно Хэмминга для снижения утечек.
                      </p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <h4 className="text-green-400 font-bold mb-2">3. Разделение на диапазоны</h4>
                      <p className="text-gray-400 text-sm">
                        Спектр делится на 6 полос: от басов (20-60 Гц) до 
                        ультравысоких (4-8 кГц). Энергия каждой полосы усредняется.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <h4 className="text-yellow-400 font-bold mb-2">4. Шумоподавление</h4>
                      <p className="text-gray-400 text-sm">
                        Пороговый фильтр отбрасывает слабые сигналы, 
                        предотвращая мерцание LED в тишине.
                      </p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <h4 className="text-orange-400 font-bold mb-2">5. Сглаживание</h4>
                      <p className="text-gray-400 text-sm">
                        Экспоненциальное сглаживание обеспечивает плавные переходы 
                        яркости. Затухание медленнее нарастания — для эффекта «импульса».
                      </p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <h4 className="text-red-400 font-bold mb-2">6. PWM управление</h4>
                      <p className="text-gray-400 text-sm">
                        Arduino генерирует ШИМ сигнал на 6 выходах. MOSFET транзисторы 
                        усиливают ток для управления 12V LED лентами.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'scheme' && (
            <div className="space-y-6">
              <WiringDiagram />
              
              {/* Подключение MOSFET */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">⚡</span> Подключение MOSFET (на примере одного канала)
                </h3>
                <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 overflow-x-auto">
                  <pre>{`
  Arduino D3 ──── [220Ω] ──── Gate (MOSFET)
                              │
  GND ─────────── [10kΩ] ────┘ (Pull-down)
                              │
                         Drain ──── LED лента (-)
                              │
                         Source ─── GND
                              
  LED лента (+) ──── +12V PSU
  PSU GND ─────────── GND (общий с Arduino)
  `}</pre>
                </div>
                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-300 text-sm">
                    <strong>⚠️ Важно:</strong> Используйте логические MOSFET (IRLZ44N, IRLB8721), 
                    которые полностью открываются при 5V на Gate. Обычные MOSFET (IRF520) 
                    могут не полностью открываться от Arduino.
                  </p>
                </div>
              </div>

              {/* Таблица пинов */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">📋</span> Таблица назначений пинов
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-4 text-gray-400">Пин</th>
                        <th className="text-left py-3 px-4 text-gray-400">Диапазон</th>
                        <th className="text-left py-3 px-4 text-gray-400">Частоты</th>
                        <th className="text-left py-3 px-4 text-gray-400">Цвет ленты</th>
                        <th className="text-left py-3 px-4 text-gray-400">Бинов FFT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { pin: 'A0', range: 'Вход', freq: '—', color: '—', bins: '—', colorClass: 'text-gray-400' },
                        { pin: 'D3', range: 'Bass', freq: '20-60 Hz', color: 'Красный', bins: '0-1', colorClass: 'text-red-400' },
                        { pin: 'D5', range: 'Low-Mid', freq: '60-250 Hz', color: 'Оранжевый', bins: '1-4', colorClass: 'text-orange-400' },
                        { pin: 'D6', range: 'Mid', freq: '250-500 Hz', color: 'Жёлтый', bins: '4-8', colorClass: 'text-yellow-400' },
                        { pin: 'D9', range: 'Upper-Mid', freq: '500-2kHz', color: 'Зелёный', bins: '8-32', colorClass: 'text-green-400' },
                        { pin: 'D10', range: 'High', freq: '2k-4kHz', color: 'Синий', bins: '32-64', colorClass: 'text-blue-400' },
                        { pin: 'D11', range: 'Ultra-High', freq: '4k-8kHz', color: 'Фиолетовый', bins: '64-127', colorClass: 'text-purple-400' },
                      ].map((row, i) => (
                        <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="py-3 px-4 font-mono text-white">{row.pin}</td>
                          <td className="py-3 px-4 text-white">{row.range}</td>
                          <td className="py-3 px-4 text-gray-300">{row.freq}</td>
                          <td className={`py-3 px-4 font-medium ${row.colorClass}`}>{row.color}</td>
                          <td className="py-3 px-4 font-mono text-gray-400">{row.bins}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'demo' && (
            <div className="space-y-6">
              <SpectrumVisualizer />
              
              {/* Serial Monitor */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">🖥️</span> Serial Monitor (115200 baud)
                </h3>
                <div className="bg-black rounded-lg p-4 font-mono text-sm">
                  <div className="text-green-400 mb-2">=== Цветомузыка запущена ===</div>
                  <div className="text-gray-400 mb-4">Разрешение FFT: 62.50 Hz/bin</div>
                  <div className="space-y-1 text-xs">
                    <div className="text-gray-300">Bass:127 LowMid:89 Mid:45 UpMid:23 High:12 Ultra:5</div>
                    <div className="text-gray-300">Bass:142 LowMid:95 Mid:52 UpMid:28 High:15 Ultra:8</div>
                    <div className="text-gray-300">Bass:98  LowMid:110 Mid:67 UpMid:35 High:18 Ultra:3</div>
                    <div className="text-gray-300">Bass:76  LowMid:82  Mid:78 UpMid:42 High:22 Ultra:11</div>
                    <div className="text-gray-300">Bass:155 LowMid:102 Mid:55 UpMid:30 High:14 Ultra:6</div>
                    <div className="text-gray-300">Bass:180 LowMid:120 Mid:48 UpMid:25 High:10 Ultra:4</div>
                    <div className="text-gray-300">Bass:65  LowMid:72  Mid:90 UpMid:55 High:30 Ultra:15</div>
                    <div className="text-gray-300">Bass:45  LowMid:55  Mid:72 UpMid:88 High:45 Ultra:22</div>
                    <div className="text-gray-500">...</div>
                  </div>
                </div>
              </div>

              {/* Советы по настройке */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">💡</span> Советы по настройке
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { title: 'Чувствительность', text: 'Измените NOISE_GATE (30-100) для подстройки под уровень шума помещения.' },
                    { title: 'Усиление', text: 'Параметр "avg / 4.0" — увеличьте делитель для меньшей чувствительности, уменьшите для большей.' },
                    { title: 'Плавность', text: 'SMOOTHING (0.5-0.9) — больше значение = плавнее переходы. DECAY_RATE (1-10) — скорость затухания.' },
                    { title: 'Разрешение FFT', text: 'SAMPLES=256 даст лучшее разрешение частот (31.25 Hz/bin), но замедлит реакцию.' },
                    { title: 'Частота дискретизации', text: 'SAMPLING_FREQ=16000 расширит диапазон до 8kHz, но увеличит время цикла.' },
                    { title: 'Калибровка', text: 'Включите printDebug() и наблюдайте за значениями. Подстройте границы диапазонов под свою музыку.' },
                  ].map((tip, i) => (
                    <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <h4 className="text-purple-400 font-bold text-sm mb-1">{tip.title}</h4>
                      <p className="text-gray-400 text-xs">{tip.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500 text-sm">
          <p>Arduino Color Music — FFT Audio Visualizer</p>
          <p className="mt-1">Требуется библиотека <a href="https://github.com/kosme/arduinoFFT" className="text-purple-400 hover:underline">ArduinoFFT</a> (установить через Library Manager)</p>
        </div>
      </footer>
    </div>
  );
}
