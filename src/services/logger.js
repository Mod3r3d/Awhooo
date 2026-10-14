/**
 * Logger — Ghi log có cấu trúc, chia theo mức độ và phạm vi (scope).
 *
 * Không phụ thuộc thư viện ngoài để bot luôn chạy được kể cả khi cài thiếu gói.
 * - Môi trường production (NODE_ENV=production): xuất JSON một dòng → dễ thu thập log.
 * - Môi trường khác: xuất dạng người đọc được, có màu.
 *
 * Có thể gắn thêm bộ thu thập lỗi bên ngoài (ví dụ Sentry) qua `attachErrorReporter`.
 */

/** Thứ tự ưu tiên của các mức log (số nhỏ = nghiêm trọng hơn) */
const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

/** Màu ANSI cho từng mức log */
const COLORS = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[36m',
    debug: '\x1b[90m'
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const isProduction = process.env.NODE_ENV === 'production';

/** Mức log tối thiểu được in ra */
const minLevel = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

/**
 * Hàm thu thập lỗi bên ngoài (Sentry, ...). Mặc định không làm gì.
 * @type {(error: Error, context: object) => void}
 */
let errorReporter = () => {};

/**
 * Gắn bộ thu thập lỗi bên ngoài (tùy chọn).
 * @param {(error: Error, context: object) => void} reporter
 */
function attachErrorReporter(reporter) {
    if (typeof reporter === 'function') errorReporter = reporter;
}

/**
 * Chuẩn hoá đối số log thành object có thể tuần tự hoá.
 * @param {unknown[]} args
 * @returns {{ message: string, meta: object }}
 */
function normalise(args) {
    const parts = [];
    const meta = {};

    for (const arg of args) {
        if (arg instanceof Error) {
            parts.push(arg.message);
            meta.err = { name: arg.name, message: arg.message, stack: arg.stack };
        } else if (arg && typeof arg === 'object') {
            Object.assign(meta, arg);
        } else {
            parts.push(String(arg));
        }
    }

    return { message: parts.join(' '), meta };
}

/**
 * Ghi một dòng log.
 * @param {'error'|'warn'|'info'|'debug'} level
 * @param {string} scope
 * @param {unknown[]} args
 */
function write(level, scope, args) {
    if (LEVELS[level] > minLevel) return;

    const { message, meta } = normalise(args);

    if (level === 'error') {
        try {
            errorReporter(meta.err ? Object.assign(new Error(meta.err.message), meta.err) : new Error(message), {
                scope,
                ...meta
            });
        } catch {
            /* Bộ thu thập lỗi không được phép làm sập bot */
        }
    }

    const time = new Date().toISOString();

    if (isProduction) {
        const record = { time, level, scope, message, ...meta };
        const line = JSON.stringify(record);
        if (level === 'error') process.stderr.write(line + '\n');
        else process.stdout.write(line + '\n');
        return;
    }

    const color = COLORS[level] || '';
    const tag = level.toUpperCase().padEnd(5);
    const extraKeys = Object.keys(meta).filter((k) => k !== 'err');
    const extra = extraKeys.length
        ? ' ' +
          DIM +
          JSON.stringify(
              extraKeys.reduce((acc, k) => {
                  acc[k] = meta[k];
                  return acc;
              }, {})
          ) +
          RESET
        : '';
    const stack = meta.err && level === 'error' ? '\n' + meta.err.stack : '';
    const line = `${DIM}${time}${RESET} ${color}${tag}${RESET} ${DIM}[${scope}]${RESET} ${message}${extra}${stack}`;

    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
}

/**
 * Tạo logger cho một phạm vi cụ thể.
 * @param {string} scope - Tên module, ví dụ "PlayerService"
 * @returns {{ error: Function, warn: Function, info: Function, debug: Function, child: (sub: string) => object }}
 */
function createLogger(scope) {
    return {
        error: (...args) => write('error', scope, args),
        warn: (...args) => write('warn', scope, args),
        info: (...args) => write('info', scope, args),
        debug: (...args) => write('debug', scope, args),
        /** Tạo logger con với phạm vi nối tiếp, ví dụ "PlayerService:play" */
        child: (sub) => createLogger(`${scope}:${sub}`)
    };
}

module.exports = {
    createLogger,
    attachErrorReporter,
    LEVELS,
    /** Logger gốc không gắn phạm vi */
    root: createLogger('bot')
};
