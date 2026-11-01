// src/error.ts
class FSRSError extends Error {
  constructor(message = "FSRS Error") {
    super(message);
    this.name = "FSRSError";
    Error.captureStackTrace?.(this, FSRSError);
  }
}

class FSRSValidationError extends FSRSError {
  constructor(message) {
    super(message);
    this.name = "FSRSValidationError";
    Error.captureStackTrace?.(this, FSRSValidationError);
  }
}

// src/models.ts
var State;
((State) => {
  State[State["New"] = 0] = "New";
  State[State["Learning"] = 1] = "Learning";
  State[State["Review"] = 2] = "Review";
  State[State["Relearning"] = 3] = "Relearning";
})(State ||= {});
var Rating;
((Rating) => {
  Rating[Rating["Manual"] = 0] = "Manual";
  Rating[Rating["Again"] = 1] = "Again";
  Rating[Rating["Hard"] = 2] = "Hard";
  Rating[Rating["Good"] = 3] = "Good";
  Rating[Rating["Easy"] = 4] = "Easy";
})(Rating ||= {});

// src/convert.ts
class TypeConvert {
  static card(card) {
    return {
      ...card,
      state: TypeConvert.state(card.state),
      due: TypeConvert.time(card.due),
      last_review: card.last_review ? TypeConvert.time(card.last_review) : undefined
    };
  }
  static rating(value) {
    if (typeof value === "string") {
      const firstLetter = value.charAt(0).toUpperCase();
      const restOfString = value.slice(1).toLowerCase();
      const ret = Rating[`${firstLetter}${restOfString}`];
      if (ret === undefined) {
        throw new FSRSValidationError(`Invalid rating:[${value}]`);
      }
      return ret;
    } else if (typeof value === "number") {
      return value;
    }
    throw new FSRSValidationError(`Invalid rating:[${value}]`);
  }
  static state(value) {
    if (typeof value === "string") {
      const firstLetter = value.charAt(0).toUpperCase();
      const restOfString = value.slice(1).toLowerCase();
      const ret = State[`${firstLetter}${restOfString}`];
      if (ret === undefined) {
        throw new FSRSValidationError(`Invalid state:[${value}]`);
      }
      return ret;
    } else if (typeof value === "number") {
      return value;
    }
    throw new FSRSValidationError(`Invalid state:[${value}]`);
  }
  static time(value) {
    if (value instanceof Date) {
      return value;
    }
    const date = new Date(value);
    if (typeof value === "object" && value !== null && !Number.isNaN(Date.parse(value) || +date)) {
      return date;
    } else if (typeof value === "string") {
      const timestamp = Date.parse(value);
      if (!Number.isNaN(timestamp)) {
        return new Date(timestamp);
      } else {
        throw new FSRSValidationError(`Invalid date:[${value}]`);
      }
    } else if (typeof value === "number") {
      return new Date(value);
    }
    throw new FSRSValidationError(`Invalid date:[${value}]`);
  }
  static review_log(log) {
    return {
      ...log,
      due: TypeConvert.time(log.due),
      rating: TypeConvert.rating(log.rating),
      state: TypeConvert.state(log.state),
      review: TypeConvert.time(log.review)
    };
  }
}

// src/help.ts
Date.prototype.scheduler = function(t, isDay) {
  return date_scheduler(this, t, isDay);
};
Date.prototype.diff = function(pre, unit) {
  return date_diff(this, pre, unit);
};
Date.prototype.format = function() {
  return formatDate(this);
};
Date.prototype.dueFormat = function(last_review, unit, timeUnit) {
  return show_diff_message(this, last_review, unit, timeUnit);
};
function date_scheduler(now, t, isDay) {
  return new Date(isDay ? TypeConvert.time(now).getTime() + t * 24 * 60 * 60 * 1000 : TypeConvert.time(now).getTime() + t * 60 * 1000);
}
function date_diff(now, pre, unit) {
  if (!now || !pre) {
    throw new FSRSValidationError("Invalid date");
  }
  const diff = TypeConvert.time(now).getTime() - TypeConvert.time(pre).getTime();
  let r = 0;
  switch (unit) {
    case "days":
      r = Math.floor(diff / (24 * 60 * 60 * 1000));
      break;
    case "minutes":
      r = Math.floor(diff / (60 * 1000));
      break;
  }
  return r;
}
function formatDate(dateInput) {
  const date = TypeConvert.time(dateInput);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  return `${year}-${padZero(month)}-${padZero(day)} ${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}
function padZero(num) {
  return num < 10 ? `0${num}` : `${num}`;
}
var TIMEUNIT = [60, 60, 24, 31, 12];
var TIMEUNITFORMAT = ["second", "min", "hour", "day", "month", "year"];
function show_diff_message(due, last_review, unit, timeUnit = TIMEUNITFORMAT) {
  due = TypeConvert.time(due);
  last_review = TypeConvert.time(last_review);
  if (timeUnit.length !== TIMEUNITFORMAT.length) {
    timeUnit = TIMEUNITFORMAT;
  }
  let diff = due.getTime() - last_review.getTime();
  let i = 0;
  diff /= 1000;
  for (i = 0;i < TIMEUNIT.length; i++) {
    if (diff < TIMEUNIT[i]) {
      break;
    } else {
      diff /= TIMEUNIT[i];
    }
  }
  return `${Math.floor(diff)}${unit ? timeUnit[i] : ""}`;
}
function fixDate(value) {
  return TypeConvert.time(value);
}
function fixState(value) {
  return TypeConvert.state(value);
}
function fixRating(value) {
  return TypeConvert.rating(value);
}
var Grades = Object.freeze([
  1 /* Again */,
  2 /* Hard */,
  3 /* Good */,
  4 /* Easy */
]);
var FUZZ_RANGES = [
  {
    start: 2.5,
    end: 7,
    factor: 0.15
  },
  {
    start: 7,
    end: 20,
    factor: 0.1
  },
  {
    start: 20,
    end: Infinity,
    factor: 0.05
  }
];
function get_fuzz_range(interval, elapsed_days, maximum_interval) {
  let delta = 1;
  for (const range of FUZZ_RANGES) {
    delta += range.factor * Math.max(Math.min(interval, range.end) - range.start, 0);
  }
  interval = Math.min(interval, maximum_interval);
  let min_ivl = Math.max(2, Math.round(interval - delta));
  const max_ivl = Math.min(Math.round(interval + delta), maximum_interval);
  if (interval > elapsed_days) {
    min_ivl = Math.max(min_ivl, elapsed_days + 1);
  }
  min_ivl = Math.min(min_ivl, max_ivl);
  return { min_ivl, max_ivl };
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function roundTo(num, decimals) {
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}
function dateDiffInDays(last, cur) {
  const utc1 = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const utc2 = Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate());
  return Math.floor((utc2 - utc1) / 86400000);
}

// src/strategies/learning_steps.ts
var ConvertStepUnitToMinutes = (step) => {
  const unit = step.slice(-1);
  const value = parseInt(step.slice(0, -1), 10);
  if (Number.isNaN(value) || !Number.isFinite(value) || value < 0) {
    throw new FSRSValidationError(`Invalid step value: ${step}`);
  }
  switch (unit) {
    case "m":
      return value;
    case "h":
      return value * 60;
    case "d":
      return value * 1440;
    default:
      throw new FSRSValidationError(`Invalid step unit: ${step}, expected m/h/d`);
  }
};
var BasicLearningStepsStrategy = (params, state, cur_step) => {
  const learning_steps = state === 3 /* Relearning */ || state === 2 /* Review */ ? params.relearning_steps : params.learning_steps;
  const steps_length = learning_steps.length;
  if (steps_length === 0 || cur_step >= steps_length)
    return {};
  const firstStep = learning_steps[0];
  const toMinutes = ConvertStepUnitToMinutes;
  const getAgainInterval = () => {
    return toMinutes(firstStep);
  };
  const getHardInterval = () => {
    if (steps_length === 1)
      return Math.round(toMinutes(firstStep) * 1.5);
    const nextStep = learning_steps[1];
    return Math.round((toMinutes(firstStep) + toMinutes(nextStep)) / 2);
  };
  const getStepInfo = (index) => {
    if (index < 0 || index >= steps_length) {
      return null;
    } else {
      return learning_steps[index];
    }
  };
  const getGoodMinutes = (step) => {
    return toMinutes(step);
  };
  const result = {};
  const step_info = getStepInfo(Math.max(0, cur_step));
  if (state === 2 /* Review */) {
    result[1 /* Again */] = {
      scheduled_minutes: toMinutes(step_info),
      next_step: 0
    };
    return result;
  } else {
    result[1 /* Again */] = {
      scheduled_minutes: getAgainInterval(),
      next_step: 0
    };
    result[2 /* Hard */] = {
      scheduled_minutes: getHardInterval(),
      next_step: cur_step
    };
    const next_info = getStepInfo(cur_step + 1);
    if (next_info) {
      const nextMin = getGoodMinutes(next_info);
      if (nextMin) {
        result[3 /* Good */] = {
          scheduled_minutes: Math.round(nextMin),
          next_step: cur_step + 1
        };
      }
    }
  }
  return result;
};
// src/strategies/seed.ts
function DefaultInitSeedStrategy() {
  const time = this.review_time.getTime();
  const reps = this.current.reps;
  const mul = this.current.difficulty * this.current.stability;
  return `${time}_${reps}_${mul}`;
}
function GenSeedStrategyWithCardId(card_id_field) {
  return function() {
    const card_id = Reflect.get(this.current, card_id_field) ?? 0;
    const reps = this.current.reps;
    return String(card_id + reps || 0);
  };
}
// src/strategies/types.ts
var StrategyMode;
((StrategyMode) => {
  StrategyMode["SCHEDULER"] = "Scheduler";
  StrategyMode["LEARNING_STEPS"] = "LearningSteps";
  StrategyMode["SEED"] = "Seed";
})(StrategyMode ||= {});
// src/abstract_scheduler.ts
class AbstractScheduler {
  last;
  current;
  review_time;
  next = new Map;
  algorithm;
  strategies;
  elapsed_days = 0;
  constructor(card, now, algorithm, strategies) {
    this.algorithm = algorithm;
    this.last = TypeConvert.card(card);
    this.current = TypeConvert.card(card);
    this.review_time = TypeConvert.time(now);
    this.strategies = strategies;
    this.init();
  }
  checkGrade(grade) {
    if (!Number.isFinite(grade) || grade < 1 || grade > 4) {
      throw new FSRSValidationError(`Invalid grade "${grade}",expected 1-4`);
    }
  }
  init() {
    const { state, last_review } = this.current;
    let interval = 0;
    if (state !== 0 /* New */ && last_review) {
      interval = dateDiffInDays(last_review, this.review_time);
    }
    this.current.last_review = this.review_time;
    this.elapsed_days = interval;
    this.current.elapsed_days = interval;
    this.current.reps += 1;
    let seed_strategy = DefaultInitSeedStrategy;
    if (this.strategies) {
      const custom_strategy = this.strategies.get("Seed" /* SEED */);
      if (custom_strategy) {
        seed_strategy = custom_strategy;
      }
    }
    this.algorithm.seed = seed_strategy.call(this);
  }
  preview() {
    return {
      [1 /* Again */]: this.review(1 /* Again */),
      [2 /* Hard */]: this.review(2 /* Hard */),
      [3 /* Good */]: this.review(3 /* Good */),
      [4 /* Easy */]: this.review(4 /* Easy */),
      [Symbol.iterator]: this.previewIterator.bind(this)
    };
  }
  *previewIterator() {
    for (const grade of Grades) {
      yield this.review(grade);
    }
  }
  review(grade) {
    const { state } = this.last;
    let item;
    this.checkGrade(grade);
    switch (state) {
      case 0 /* New */:
        item = this.newState(grade);
        break;
      case 1 /* Learning */:
      case 3 /* Relearning */:
        item = this.learningState(grade);
        break;
      case 2 /* Review */:
        item = this.reviewState(grade);
        break;
    }
    return item;
  }
  buildLog(rating) {
    const { last_review, due, elapsed_days } = this.last;
    return {
      rating,
      state: this.current.state,
      due: last_review || due,
      stability: this.current.stability,
      difficulty: this.current.difficulty,
      elapsed_days: this.elapsed_days,
      last_elapsed_days: elapsed_days,
      scheduled_days: this.current.scheduled_days,
      learning_steps: this.current.learning_steps,
      review: this.review_time
    };
  }
}
// src/alea.ts
class Alea {
  c;
  s0;
  s1;
  s2;
  constructor(seed) {
    const mash = Mash();
    this.c = 1;
    this.s0 = mash(" ");
    this.s1 = mash(" ");
    this.s2 = mash(" ");
    if (seed == null)
      seed = Date.now();
    this.s0 -= mash(seed);
    if (this.s0 < 0)
      this.s0 += 1;
    this.s1 -= mash(seed);
    if (this.s1 < 0)
      this.s1 += 1;
    this.s2 -= mash(seed);
    if (this.s2 < 0)
      this.s2 += 1;
  }
  next() {
    const t = 2091639 * this.s0 + this.c * 0.00000000023283064365386963;
    this.s0 = this.s1;
    this.s1 = this.s2;
    this.c = t | 0;
    this.s2 = t - this.c;
    return this.s2;
  }
  set state(state) {
    this.c = state.c;
    this.s0 = state.s0;
    this.s1 = state.s1;
    this.s2 = state.s2;
  }
  get state() {
    return {
      c: this.c,
      s0: this.s0,
      s1: this.s1,
      s2: this.s2
    };
  }
}
function Mash() {
  let n = 4022871197;
  return function mash(data) {
    data = String(data);
    for (let i = 0;i < data.length; i++) {
      n += data.charCodeAt(i);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 4294967296;
    }
    return (n >>> 0) * 0.00000000023283064365386963;
  };
}
function alea(seed) {
  const xg = new Alea(seed);
  const prng = () => xg.next();
  prng.int32 = () => xg.next() * 4294967296 | 0;
  prng.double = () => prng() + (prng() * 2097152 | 0) * 0.00000000000000011102230246251565;
  prng.state = () => xg.state;
  prng.importState = (state) => {
    xg.state = state;
    return prng;
  };
  return prng;
}
// package.json
var version = "5.4.2";

// src/constant.ts
var default_request_retention = 0.9;
var default_maximum_interval = 36500;
var default_enable_fuzz = false;
var default_enable_short_term = true;
var default_learning_steps = Object.freeze([
  "1m",
  "10m"
]);
var default_relearning_steps = Object.freeze([
  "10m"
]);
var FSRSVersion = `v${version} using FSRS-6.0`;
var S_MIN = 0.001;
var S_MAX = 36500;
var INIT_S_MAX = 100;
var FSRS5_DEFAULT_DECAY = 0.5;
var FSRS6_DEFAULT_DECAY = 0.1542;
var default_w = Object.freeze([
  0.212,
  1.2931,
  2.3065,
  8.2956,
  6.4133,
  0.8334,
  3.0194,
  0.001,
  1.8722,
  0.1666,
  0.796,
  1.4835,
  0.0614,
  0.2629,
  1.6483,
  0.6014,
  1.8729,
  0.5425,
  0.0912,
  0.0658,
  FSRS6_DEFAULT_DECAY
]);
var W17_W18_Ceiling = 2;
var CLAMP_PARAMETERS = (w17_w18_ceiling, enable_short_term = default_enable_short_term) => [
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [1, 10],
  [0.001, 4],
  [0.001, 4],
  [0.001, 0.75],
  [0, 4.5],
  [0, 0.8],
  [0.001, 3.5],
  [0.001, 5],
  [0.001, 0.25],
  [0.001, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, w17_w18_ceiling],
  [0, w17_w18_ceiling],
  [
    enable_short_term ? 0.01 : 0,
    0.8
  ],
  [0.1, 0.8]
];

// src/default.ts
var clipParameters = (parameters, numRelearningSteps, enableShortTerm = default_enable_short_term) => {
  const clip = CLAMP_PARAMETERS(W17_W18_Ceiling, enableShortTerm).slice(0, parameters.length);
  if (Math.max(0, numRelearningSteps) > 1) {
    const w11 = clamp(parameters[11] || 0, clip[11][0], clip[11][1]);
    const w13 = clamp(parameters[13] || 0, clip[13][0], clip[13][1]);
    const w14 = clamp(parameters[14] || 0, clip[14][0], clip[14][1]);
    const value = -(Math.log(w11) + Math.log(Math.pow(2, w13) - 1) + w14 * 0.3) / numRelearningSteps;
    const w17_w18_ceiling = clamp(roundTo(Math.sqrt(Math.max(value, 0)), 8), 0.01, W17_W18_Ceiling);
    if (clip[17])
      clip[17] = [clip[17][0], w17_w18_ceiling];
    if (clip[18])
      clip[18] = [clip[18][0], w17_w18_ceiling];
  }
  return clip.map(([min, max], index) => clamp(parameters[index] || 0, min, max));
};
var checkParameters = (parameters) => {
  const invalid = parameters.find((param) => !Number.isFinite(param));
  if (invalid !== undefined) {
    throw new FSRSValidationError(`Non-finite or NaN value in parameters ${parameters}`);
  } else if (![17, 19, 21].includes(parameters.length)) {
    throw new FSRSValidationError(`Invalid parameter length: ${parameters.length}. Must be 17, 19 or 21 for FSRSv4, 5 and 6 respectively.`);
  }
  return parameters;
};
var migrateParameters = (parameters, numRelearningSteps = 0, enableShortTerm = default_enable_short_term) => {
  if (parameters === undefined) {
    return [...default_w];
  }
  switch (parameters.length) {
    case 21:
      return clipParameters(Array.from(parameters), numRelearningSteps, enableShortTerm);
    case 19:
      console.debug("[FSRS-6]auto fill w from 19 to 21 length");
      return clipParameters(Array.from(parameters), numRelearningSteps, enableShortTerm).concat([0, FSRS5_DEFAULT_DECAY]);
    case 17: {
      const w = clipParameters(Array.from(parameters), numRelearningSteps, enableShortTerm);
      w[4] = +(w[5] * 2 + w[4]).toFixed(8);
      w[5] = +(Math.log(w[5] * 3 + 1) / 3).toFixed(8);
      w[6] = +(w[6] + 0.5).toFixed(8);
      console.debug("[FSRS-6]auto fill w from 17 to 21 length");
      return w.concat([0, 0, 0, FSRS5_DEFAULT_DECAY]);
    }
    default:
      console.warn("[FSRS]Invalid parameters length, using default parameters");
      return [...default_w];
  }
};
var generatorParameters = (props) => {
  const learning_steps = Array.isArray(props?.learning_steps) ? props.learning_steps : default_learning_steps;
  const relearning_steps = Array.isArray(props?.relearning_steps) ? props.relearning_steps : default_relearning_steps;
  const enable_short_term = props?.enable_short_term ?? default_enable_short_term;
  const w = migrateParameters(props?.w, relearning_steps.length, enable_short_term);
  return {
    request_retention: props?.request_retention || default_request_retention,
    maximum_interval: props?.maximum_interval || default_maximum_interval,
    w,
    enable_fuzz: props?.enable_fuzz ?? default_enable_fuzz,
    enable_short_term,
    learning_steps,
    relearning_steps
  };
};
function createEmptyCard(now, afterHandler) {
  const emptyCard = {
    due: now ? TypeConvert.time(now) : new Date,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: 0 /* New */,
    last_review: undefined
  };
  if (afterHandler && typeof afterHandler === "function") {
    return afterHandler(emptyCard);
  } else {
    return emptyCard;
  }
}

// src/algorithm.ts
var computeDecayFactor = (decayOrParams) => {
  const decay = typeof decayOrParams === "number" ? -decayOrParams : -decayOrParams[20];
  const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
  return { decay, factor: roundTo(factor, 8) };
};
function forgetting_curve(decayOrParams, elapsed_days, stability) {
  const { decay, factor } = computeDecayFactor(decayOrParams);
  return roundTo(Math.pow(1 + factor * elapsed_days / stability, decay), 8);
}

class FSRSAlgorithm {
  param;
  intervalModifier;
  _seed;
  constructor(params) {
    this.param = new Proxy(this.prepare_parameters(params), this.params_handler_proxy());
    this.intervalModifier = this.calculate_interval_modifier(this.param.request_retention);
    this.forgetting_curve = forgetting_curve.bind(this, this.param.w);
  }
  get interval_modifier() {
    return this.intervalModifier;
  }
  set seed(seed) {
    this._seed = seed;
  }
  calculate_interval_modifier(request_retention) {
    if (request_retention <= 0 || request_retention > 1) {
      throw new FSRSValidationError("Requested retention rate should be in the range (0,1]");
    }
    const { decay, factor } = computeDecayFactor(this.param.w);
    return roundTo((Math.pow(request_retention, 1 / decay) - 1) / factor, 8);
  }
  get parameters() {
    return this.param;
  }
  set parameters(params) {
    this.update_parameters(params);
  }
  params_handler_proxy() {
    const _this = this;
    return {
      set: function(target, prop, value) {
        if (prop === "request_retention" && Number.isFinite(value)) {
          _this.intervalModifier = _this.calculate_interval_modifier(Number(value));
        } else if (prop === "w") {
          value = migrateParameters(value, target.relearning_steps.length, target.enable_short_term);
          value = clipParameters(Array.from(value), target.relearning_steps.length, target.enable_short_term);
          _this.forgetting_curve = forgetting_curve.bind(this, value);
          _this.intervalModifier = _this.calculate_interval_modifier(Number(target.request_retention));
        }
        Reflect.set(target, prop, value);
        return true;
      }
    };
  }
  update_parameters(params) {
    const _params = this.prepare_parameters(params);
    for (const key in _params) {
      const paramKey = key;
      this.param[paramKey] = _params[paramKey];
    }
  }
  prepare_parameters = (params) => {
    const generated = generatorParameters(params);
    generated.w = clipParameters(Array.from(generated.w), generated.relearning_steps.length, generated.enable_short_term);
    return generated;
  };
  init_stability(g) {
    return Math.max(this.param.w[g - 1], 0.1);
  }
  init_difficulty(g) {
    const w = this.param.w;
    const d = w[4] - Math.exp((g - 1) * w[5]) + 1;
    return roundTo(d, 8);
  }
  apply_fuzz(ivl, elapsed_days) {
    if (!this.param.enable_fuzz || ivl < 2.5)
      return Math.round(ivl);
    const generator = alea(this._seed);
    const fuzz_factor = generator();
    const { min_ivl, max_ivl } = get_fuzz_range(ivl, elapsed_days, this.param.maximum_interval);
    return Math.floor(fuzz_factor * (max_ivl - min_ivl + 1) + min_ivl);
  }
  next_interval(s, elapsed_days) {
    const newInterval = Math.min(Math.max(1, Math.round(s * this.intervalModifier)), this.param.maximum_interval);
    return this.apply_fuzz(newInterval, elapsed_days);
  }
  linear_damping(delta_d, old_d) {
    return roundTo(delta_d * (10 - old_d) / 9, 8);
  }
  next_difficulty(d, g) {
    const delta_d = -this.param.w[6] * (g - 3);
    const next_d = d + this.linear_damping(delta_d, d);
    return clamp(this.mean_reversion(this.init_difficulty(4 /* Easy */), next_d), 1, 10);
  }
  mean_reversion(init, current) {
    const w = this.param.w;
    return roundTo(w[7] * init + (1 - w[7]) * current, 8);
  }
  next_recall_stability(d, s, r, g) {
    const w = this.param.w;
    const hard_penalty = 2 /* Hard */ === g ? w[15] : 1;
    const easy_bound = 4 /* Easy */ === g ? w[16] : 1;
    return roundTo(clamp(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard_penalty * easy_bound), S_MIN, 36500), 8);
  }
  next_forget_stability(d, s, r) {
    const w = this.param.w;
    return roundTo(clamp(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]), S_MIN, 36500), 8);
  }
  next_short_term_stability(s, g) {
    const w = this.param.w;
    const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
    const maskedSinc = g >= 2 /* Hard */ ? Math.max(sinc, 1) : sinc;
    return roundTo(clamp(s * maskedSinc, S_MIN, 36500), 8);
  }
  forgetting_curve;
  next_state(memory_state, t, g, r) {
    const { difficulty: d, stability: s } = memory_state ?? {
      difficulty: 0,
      stability: 0
    };
    if (t < 0) {
      throw new FSRSValidationError(`Invalid delta_t "${t}"`);
    }
    if (g < 0 || g > 4) {
      throw new FSRSValidationError(`Invalid grade "${g}"`);
    }
    if (d === 0 && s === 0) {
      return {
        difficulty: clamp(this.init_difficulty(g), 1, 10),
        stability: this.init_stability(g)
      };
    }
    if (g === 0) {
      return {
        difficulty: d,
        stability: s
      };
    }
    if (d < 1 || s < S_MIN) {
      throw new FSRSValidationError(`Invalid memory state { difficulty: ${d}, stability: ${s} }`);
    }
    const w = this.param.w;
    r = typeof r === "number" ? r : this.forgetting_curve(t, s);
    let new_s;
    if (t === 0 && this.param.enable_short_term) {
      new_s = this.next_short_term_stability(s, g);
    } else if (g === 1) {
      const s_after_fail = this.next_forget_stability(d, s, r);
      let [w_17, w_18] = [0, 0];
      if (this.param.enable_short_term) {
        w_17 = w[17];
        w_18 = w[18];
      }
      const next_s_min = s / Math.exp(w_17 * w_18);
      new_s = clamp(roundTo(next_s_min, 8), S_MIN, s_after_fail);
    } else {
      new_s = this.next_recall_stability(d, s, r, g);
    }
    const new_d = this.next_difficulty(d, g);
    return { difficulty: new_d, stability: new_s };
  }
}
// src/impl/basic_scheduler.ts
class BasicScheduler extends AbstractScheduler {
  learningStepsStrategy;
  constructor(card, now, algorithm, strategies) {
    super(card, now, algorithm, strategies);
    let learningStepStrategy = BasicLearningStepsStrategy;
    if (this.strategies) {
      const custom_strategy = this.strategies.get("LearningSteps" /* LEARNING_STEPS */);
      if (custom_strategy) {
        learningStepStrategy = custom_strategy;
      }
    }
    this.learningStepsStrategy = learningStepStrategy;
  }
  getLearningInfo(card, grade) {
    const parameters = this.algorithm.parameters;
    card.learning_steps = card.learning_steps || 0;
    const steps_strategy = this.learningStepsStrategy(parameters, card.state, card.learning_steps);
    const scheduled_minutes = Math.max(0, steps_strategy[grade]?.scheduled_minutes ?? 0);
    const next_steps = Math.max(0, steps_strategy[grade]?.next_step ?? 0);
    return {
      scheduled_minutes,
      next_steps
    };
  }
  applyLearningSteps(nextCard, grade, to_state) {
    const { scheduled_minutes, next_steps } = this.getLearningInfo(this.current, grade);
    if (scheduled_minutes > 0 && scheduled_minutes < 1440) {
      nextCard.learning_steps = next_steps;
      nextCard.scheduled_days = 0;
      nextCard.state = to_state;
      nextCard.due = date_scheduler(this.review_time, Math.round(scheduled_minutes), false);
    } else {
      nextCard.state = 2 /* Review */;
      if (scheduled_minutes >= 1440) {
        nextCard.learning_steps = next_steps;
        nextCard.due = date_scheduler(this.review_time, Math.round(scheduled_minutes), false);
        nextCard.scheduled_days = Math.floor(scheduled_minutes / 1440);
      } else {
        nextCard.learning_steps = 0;
        const interval = this.algorithm.next_interval(nextCard.stability, this.elapsed_days);
        nextCard.scheduled_days = interval;
        nextCard.due = date_scheduler(this.review_time, interval, true);
      }
    }
  }
  newState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    const next = this.next_ds(this.elapsed_days, grade);
    this.applyLearningSteps(next, grade, 1 /* Learning */);
    const item = {
      card: next,
      log: this.buildLog(grade)
    };
    this.next.set(grade, item);
    return item;
  }
  learningState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    const next = this.next_ds(this.elapsed_days, grade);
    this.applyLearningSteps(next, grade, this.last.state);
    const item = {
      card: next,
      log: this.buildLog(grade)
    };
    this.next.set(grade, item);
    return item;
  }
  reviewState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    const interval = this.elapsed_days;
    const retrievability = this.algorithm.forgetting_curve(interval, this.current.stability);
    const next_again = this.next_ds(interval, 1 /* Again */, retrievability);
    const next_hard = this.next_ds(interval, 2 /* Hard */, retrievability);
    const next_good = this.next_ds(interval, 3 /* Good */, retrievability);
    const next_easy = this.next_ds(interval, 4 /* Easy */, retrievability);
    this.next_interval(next_hard, next_good, next_easy, interval);
    this.next_state(next_hard, next_good, next_easy);
    this.applyLearningSteps(next_again, 1 /* Again */, 3 /* Relearning */);
    next_again.lapses += 1;
    const item_again = {
      card: next_again,
      log: this.buildLog(1 /* Again */)
    };
    const item_hard = {
      card: next_hard,
      log: super.buildLog(2 /* Hard */)
    };
    const item_good = {
      card: next_good,
      log: super.buildLog(3 /* Good */)
    };
    const item_easy = {
      card: next_easy,
      log: super.buildLog(4 /* Easy */)
    };
    this.next.set(1 /* Again */, item_again);
    this.next.set(2 /* Hard */, item_hard);
    this.next.set(3 /* Good */, item_good);
    this.next.set(4 /* Easy */, item_easy);
    return this.next.get(grade);
  }
  next_ds(t, g, r) {
    const next_state = this.algorithm.next_state({
      difficulty: this.current.difficulty,
      stability: this.current.stability
    }, t, g, r);
    const card = TypeConvert.card(this.current);
    card.difficulty = next_state.difficulty;
    card.stability = next_state.stability;
    return card;
  }
  next_interval(next_hard, next_good, next_easy, interval) {
    let hard_interval, good_interval;
    hard_interval = this.algorithm.next_interval(next_hard.stability, interval);
    good_interval = this.algorithm.next_interval(next_good.stability, interval);
    hard_interval = Math.min(hard_interval, good_interval);
    good_interval = Math.max(good_interval, hard_interval + 1);
    const easy_interval = Math.max(this.algorithm.next_interval(next_easy.stability, interval), good_interval + 1);
    next_hard.scheduled_days = hard_interval;
    next_hard.due = date_scheduler(this.review_time, hard_interval, true);
    next_good.scheduled_days = good_interval;
    next_good.due = date_scheduler(this.review_time, good_interval, true);
    next_easy.scheduled_days = easy_interval;
    next_easy.due = date_scheduler(this.review_time, easy_interval, true);
  }
  next_state(next_hard, next_good, next_easy) {
    next_hard.state = 2 /* Review */;
    next_hard.learning_steps = 0;
    next_good.state = 2 /* Review */;
    next_good.learning_steps = 0;
    next_easy.state = 2 /* Review */;
    next_easy.learning_steps = 0;
  }
}

// src/impl/long_term_scheduler.ts
class LongTermScheduler extends AbstractScheduler {
  newState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    this.current.scheduled_days = 0;
    this.current.elapsed_days = 0;
    const first_interval = 0;
    const next_again = this.next_ds(first_interval, 1 /* Again */);
    const next_hard = this.next_ds(first_interval, 2 /* Hard */);
    const next_good = this.next_ds(first_interval, 3 /* Good */);
    const next_easy = this.next_ds(first_interval, 4 /* Easy */);
    this.next_interval(next_again, next_hard, next_good, next_easy, first_interval);
    this.next_state(next_again, next_hard, next_good, next_easy);
    this.update_next(next_again, next_hard, next_good, next_easy);
    return this.next.get(grade);
  }
  next_ds(t, g, r) {
    const next_state = this.algorithm.next_state({
      difficulty: this.current.difficulty,
      stability: this.current.stability
    }, t, g, r);
    const card = TypeConvert.card(this.current);
    card.difficulty = next_state.difficulty;
    card.stability = next_state.stability;
    return card;
  }
  learningState(grade) {
    return this.reviewState(grade);
  }
  reviewState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    const interval = this.elapsed_days;
    const retrievability = this.algorithm.forgetting_curve(interval, this.current.stability);
    const next_again = this.next_ds(interval, 1 /* Again */, retrievability);
    const next_hard = this.next_ds(interval, 2 /* Hard */, retrievability);
    const next_good = this.next_ds(interval, 3 /* Good */, retrievability);
    const next_easy = this.next_ds(interval, 4 /* Easy */, retrievability);
    this.next_interval(next_again, next_hard, next_good, next_easy, interval);
    this.next_state(next_again, next_hard, next_good, next_easy);
    next_again.lapses += 1;
    this.update_next(next_again, next_hard, next_good, next_easy);
    return this.next.get(grade);
  }
  next_interval(next_again, next_hard, next_good, next_easy, interval) {
    let again_interval, hard_interval, good_interval, easy_interval;
    again_interval = this.algorithm.next_interval(next_again.stability, interval);
    hard_interval = this.algorithm.next_interval(next_hard.stability, interval);
    good_interval = this.algorithm.next_interval(next_good.stability, interval);
    easy_interval = this.algorithm.next_interval(next_easy.stability, interval);
    again_interval = Math.min(again_interval, hard_interval);
    hard_interval = Math.max(hard_interval, again_interval + 1);
    good_interval = Math.max(good_interval, hard_interval + 1);
    easy_interval = Math.max(easy_interval, good_interval + 1);
    next_again.scheduled_days = again_interval;
    next_again.due = date_scheduler(this.review_time, again_interval, true);
    next_hard.scheduled_days = hard_interval;
    next_hard.due = date_scheduler(this.review_time, hard_interval, true);
    next_good.scheduled_days = good_interval;
    next_good.due = date_scheduler(this.review_time, good_interval, true);
    next_easy.scheduled_days = easy_interval;
    next_easy.due = date_scheduler(this.review_time, easy_interval, true);
  }
  next_state(next_again, next_hard, next_good, next_easy) {
    next_again.state = 2 /* Review */;
    next_again.learning_steps = 0;
    next_hard.state = 2 /* Review */;
    next_hard.learning_steps = 0;
    next_good.state = 2 /* Review */;
    next_good.learning_steps = 0;
    next_easy.state = 2 /* Review */;
    next_easy.learning_steps = 0;
  }
  update_next(next_again, next_hard, next_good, next_easy) {
    const item_again = {
      card: next_again,
      log: this.buildLog(1 /* Again */)
    };
    const item_hard = {
      card: next_hard,
      log: super.buildLog(2 /* Hard */)
    };
    const item_good = {
      card: next_good,
      log: super.buildLog(3 /* Good */)
    };
    const item_easy = {
      card: next_easy,
      log: super.buildLog(4 /* Easy */)
    };
    this.next.set(1 /* Again */, item_again);
    this.next.set(2 /* Hard */, item_hard);
    this.next.set(3 /* Good */, item_good);
    this.next.set(4 /* Easy */, item_easy);
  }
}

// src/reschedule.ts
class Reschedule {
  fsrs;
  constructor(fsrs) {
    this.fsrs = fsrs;
  }
  replay(card, reviewed, rating) {
    return this.fsrs.next(card, reviewed, rating);
  }
  handleManualRating(card, state, reviewed, elapsed_days, stability, difficulty, due) {
    if (typeof state === "undefined") {
      throw new FSRSValidationError("reschedule: state is required for manual rating");
    }
    let log;
    let next_card;
    if (state === 0 /* New */) {
      log = {
        rating: 0 /* Manual */,
        state,
        due: due ?? reviewed,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days,
        last_elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
        review: reviewed
      };
      next_card = createEmptyCard(reviewed);
      next_card.last_review = reviewed;
    } else {
      if (typeof due === "undefined") {
        throw new FSRSValidationError("reschedule: due is required for manual rating");
      }
      const scheduled_days = date_diff(due, reviewed, "days");
      log = {
        rating: 0 /* Manual */,
        state: card.state,
        due: card.last_review || card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days,
        last_elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
        review: reviewed
      };
      next_card = {
        ...card,
        state,
        due,
        last_review: reviewed,
        stability: stability || card.stability,
        difficulty: difficulty || card.difficulty,
        elapsed_days,
        scheduled_days,
        reps: card.reps + 1
      };
    }
    return { card: next_card, log };
  }
  reschedule(current_card, reviews) {
    const collections = [];
    let cur_card = createEmptyCard(current_card.due);
    for (const review of reviews) {
      let item;
      review.review = TypeConvert.time(review.review);
      if (review.rating === 0 /* Manual */) {
        let interval = 0;
        if (cur_card.state !== 0 /* New */ && cur_card.last_review) {
          interval = date_diff(review.review, cur_card.last_review, "days");
        }
        item = this.handleManualRating(cur_card, review.state, review.review, interval, review.stability, review.difficulty, review.due ? TypeConvert.time(review.due) : undefined);
      } else {
        item = this.replay(cur_card, review.review, review.rating);
      }
      collections.push(item);
      cur_card = item.card;
    }
    return collections;
  }
  calculateManualRecord(current_card, now, record_log_item, update_memory) {
    if (!record_log_item) {
      return null;
    }
    const { card: reschedule_card, log } = record_log_item;
    const cur_card = TypeConvert.card(current_card);
    if (cur_card.due.getTime() === reschedule_card.due.getTime()) {
      return null;
    }
    cur_card.scheduled_days = date_diff(reschedule_card.due, cur_card.due, "days");
    return this.handleManualRating(cur_card, reschedule_card.state, TypeConvert.time(now), log.elapsed_days, update_memory ? reschedule_card.stability : undefined, update_memory ? reschedule_card.difficulty : undefined, reschedule_card.due);
  }
}

// src/fsrs.ts
function applyAfterHandler(value, afterHandler) {
  return typeof afterHandler === "function" ? afterHandler(value) : value;
}

class FSRS extends FSRSAlgorithm {
  strategyHandler = new Map;
  Scheduler;
  constructor(param) {
    super(param);
    const { enable_short_term } = this.parameters;
    this.Scheduler = enable_short_term ? BasicScheduler : LongTermScheduler;
  }
  params_handler_proxy() {
    const _this = this;
    return {
      set: function(target, prop, value) {
        if (prop === "request_retention" && Number.isFinite(value)) {
          _this.intervalModifier = _this.calculate_interval_modifier(Number(value));
        } else if (prop === "enable_short_term") {
          _this.Scheduler = value === true ? BasicScheduler : LongTermScheduler;
        } else if (prop === "w") {
          value = migrateParameters(value, target.relearning_steps.length, target.enable_short_term);
          value = clipParameters(Array.from(value), target.relearning_steps.length, target.enable_short_term);
          _this.forgetting_curve = forgetting_curve.bind(this, value);
          _this.intervalModifier = _this.calculate_interval_modifier(Number(target.request_retention));
        }
        Reflect.set(target, prop, value);
        return true;
      }
    };
  }
  useStrategy(mode, handler) {
    this.strategyHandler.set(mode, handler);
    return this;
  }
  clearStrategy(mode) {
    if (mode) {
      this.strategyHandler.delete(mode);
    } else {
      this.strategyHandler.clear();
    }
    return this;
  }
  getScheduler(card, now) {
    const schedulerStrategy = this.strategyHandler.get("Scheduler" /* SCHEDULER */);
    const Scheduler = schedulerStrategy || this.Scheduler;
    const instance = new Scheduler(card, now, this, this.strategyHandler);
    return instance;
  }
  repeat(card, now, afterHandler) {
    const instance = this.getScheduler(card, now);
    const recordLog = instance.preview();
    return applyAfterHandler(recordLog, afterHandler);
  }
  next(card, now, grade, afterHandler) {
    const instance = this.getScheduler(card, now);
    const g = TypeConvert.rating(grade);
    if (g === 0 /* Manual */) {
      throw new FSRSValidationError("Cannot review a manual rating");
    }
    const recordLogItem = instance.review(g);
    return applyAfterHandler(recordLogItem, afterHandler);
  }
  get_retrievability(card, now, format = true) {
    const processedCard = TypeConvert.card(card);
    now = now ? TypeConvert.time(now) : new Date;
    const t = processedCard.state !== 0 /* New */ ? Math.max(date_diff(now, processedCard.last_review, "days"), 0) : 0;
    const r = processedCard.state !== 0 /* New */ ? this.forgetting_curve(t, +processedCard.stability.toFixed(8)) : 0;
    return format ? `${(r * 100).toFixed(2)}%` : r;
  }
  rollback(card, log, afterHandler) {
    const processedCard = TypeConvert.card(card);
    const processedLog = TypeConvert.review_log(log);
    if (processedLog.rating === 0 /* Manual */) {
      throw new FSRSValidationError("Cannot rollback a manual rating");
    }
    let last_due;
    let last_review;
    let last_lapses;
    switch (processedLog.state) {
      case 0 /* New */:
        last_due = processedLog.due;
        last_review = undefined;
        last_lapses = 0;
        break;
      case 1 /* Learning */:
      case 3 /* Relearning */:
      case 2 /* Review */:
        last_due = processedLog.review;
        last_review = processedLog.due;
        last_lapses = processedCard.lapses - (processedLog.rating === 1 /* Again */ && processedLog.state === 2 /* Review */ ? 1 : 0);
        break;
    }
    const prevCard = {
      ...processedCard,
      due: last_due,
      stability: processedLog.stability,
      difficulty: processedLog.difficulty,
      elapsed_days: processedLog.last_elapsed_days,
      scheduled_days: processedLog.scheduled_days,
      reps: Math.max(0, processedCard.reps - 1),
      lapses: Math.max(0, last_lapses),
      learning_steps: processedLog.learning_steps,
      state: processedLog.state,
      last_review
    };
    return applyAfterHandler(prevCard, afterHandler);
  }
  forget(card, now, reset_count = false, afterHandler) {
    const processedCard = TypeConvert.card(card);
    now = TypeConvert.time(now);
    const scheduled_days = processedCard.state === 0 /* New */ ? 0 : date_diff(now, processedCard.due, "days");
    const forget_log = {
      rating: 0 /* Manual */,
      state: processedCard.state,
      due: processedCard.due,
      stability: processedCard.stability,
      difficulty: processedCard.difficulty,
      elapsed_days: 0,
      last_elapsed_days: processedCard.elapsed_days,
      scheduled_days,
      learning_steps: processedCard.learning_steps,
      review: now
    };
    const forget_card = {
      ...processedCard,
      due: now,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: reset_count ? 0 : processedCard.reps,
      lapses: reset_count ? 0 : processedCard.lapses,
      learning_steps: 0,
      state: 0 /* New */,
      last_review: processedCard.last_review
    };
    const recordLogItem = { card: forget_card, log: forget_log };
    return applyAfterHandler(recordLogItem, afterHandler);
  }
  reschedule(current_card, reviews = [], options = {}) {
    const {
      recordLogHandler,
      reviewsOrderBy,
      skipManual = true,
      now = new Date,
      update_memory_state: updateMemoryState = false
    } = options;
    if (reviewsOrderBy && typeof reviewsOrderBy === "function") {
      reviews.sort(reviewsOrderBy);
    }
    if (skipManual) {
      reviews = reviews.filter((review) => review.rating !== 0 /* Manual */);
    }
    const rescheduleSvc = new Reschedule(this);
    const collections = rescheduleSvc.reschedule(options.first_card || createEmptyCard(), reviews);
    const len = collections.length;
    const cur_card = TypeConvert.card(current_card);
    const manual_item = rescheduleSvc.calculateManualRecord(cur_card, now, len ? collections[len - 1] : undefined, updateMemoryState);
    return {
      collections: typeof recordLogHandler === "function" ? collections.map(recordLogHandler) : collections,
      reschedule_item: manual_item ? applyAfterHandler(manual_item, recordLogHandler) : null
    };
  }
}
var fsrs = (params) => {
  return new FSRS(params || {});
};
export {
  AbstractScheduler,
  BasicLearningStepsStrategy,
  CLAMP_PARAMETERS,
  ConvertStepUnitToMinutes,
  DefaultInitSeedStrategy,
  FSRS,
  FSRS5_DEFAULT_DECAY,
  FSRS6_DEFAULT_DECAY,
  FSRSAlgorithm,
  FSRSVersion,
  GenSeedStrategyWithCardId,
  Grades,
  INIT_S_MAX,
  Rating,
  S_MAX,
  S_MIN,
  State,
  StrategyMode,
  TypeConvert,
  W17_W18_Ceiling,
  checkParameters,
  clamp,
  clipParameters,
  computeDecayFactor,
  createEmptyCard,
  dateDiffInDays,
  date_diff,
  date_scheduler,
  default_enable_fuzz,
  default_enable_short_term,
  default_learning_steps,
  default_maximum_interval,
  default_relearning_steps,
  default_request_retention,
  default_w,
  fixDate,
  fixRating,
  fixState,
  forgetting_curve,
  formatDate,
  fsrs,
  generatorParameters,
  get_fuzz_range,
  migrateParameters,
  roundTo,
  show_diff_message
};
