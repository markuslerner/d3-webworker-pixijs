export default class SmoothFollow {

  constructor(value = 0.0, mass = 0.2) {
    this.mass = mass;
    this.value = value;
    this.valueSmooth = value;
    this.pristine = true;

    return this;
  }

  setMass(mass) {
    this.mass = mass;
    if(this.mass < 0) {
      this.mass = 0;
    }

    return this;
  }

  set(value) {
    if(this.pristine) {
      this.pristine = false;
      this.reset(value);
    } else {
      this.value = value;
    }
  }

  get() {
    return this.value;
  }

  reset(value) {
    this.value = value;
    this.valueSmooth = value;
  }

  getSmooth() {
    return this.valueSmooth;
  }

  interpolateLinear(value0, value1, pos) {
    return value0 + pos * (value1 - value0);
  }

  loop(deltaTime) {
    if(this.mass === 0) {
      this.valueSmooth = this.value;

    } else {
      this.valueSmooth = this.interpolateLinear(this.valueSmooth, this.value, deltaTime / this.mass);
    }

    return this;
  }

  toString() {
    return 'SmoothFollow | value: ' + this.value + ', valueSmooth: ' + this.valueSmooth;
  }

}
