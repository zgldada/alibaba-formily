import {
  FormPath,
  isValid,
  isArr,
  FormPathPattern,
  isNum,
  isObj
} from '@formily/shared'
import {
  validate,
  ValidatorTriggerType,
  Validator,
  parseDescriptions
} from '@formily/validator'
import { action, makeObservable, observable, runInAction, toJS } from 'mobx'
import { FunctionComponent, LifeCycleTypes } from '../types'
import { FeedbackMessage } from './Feedback'
import { Form } from './Form'

export type FieldDecorator<Decorator extends FunctionComponent> =
  | [Decorator, Parameters<Decorator>[0]]
  | []
  | [Decorator]

export type FieldComponent<Component extends FunctionComponent> =
  | [Component, Parameters<Component>[0]]
  | []
  | [Component]

export type FieldDisplayTypes = 'none' | 'hidden' | 'visibility'

export type FieldPatternTypes =
  | 'editable'
  | 'readOnly'
  | 'disabled'
  | 'readPretty'

export type FieldValidator = Validator

export interface IFieldProps<
  Decorator extends FunctionComponent = any,
  Component extends FunctionComponent = any
> {
  value?: any
  initialValue?: any
  void?: boolean
  display?: FieldDisplayTypes
  pattern?: FieldPatternTypes
  validator?: Validator
  decorator?: FieldDecorator<Decorator>
  component?: FieldComponent<Component>
}

export interface IFieldResetOptions {
  forceClear?: boolean
  validate?: boolean
  clearInitialValue?: boolean
}

export class Field<
  Decorator extends FunctionComponent = any,
  Component extends FunctionComponent = any
> {
  void: boolean
  display: FieldDisplayTypes
  pattern: FieldPatternTypes
  loading: boolean
  validating: boolean
  modified: boolean
  active: boolean
  visited: boolean
  inputValue: any
  inputValues: any[]
  recycledValue: any
  initialized: boolean
  mounted: boolean
  unmounted: boolean
  validator: FieldValidator
  decorator: FieldDecorator<Decorator>
  component: FieldComponent<Component>

  form: Form
  path: FormPath
  props: IFieldProps<Decorator, Component>
  constructor(props: IFieldProps<Decorator, Component>) {
    this.initialize(props)
    this.makeObservable()
    this.setValue(props.value)
    this.setInitialValue(props.initialValue)
  }

  initialize(props: IFieldProps<Decorator, Component>) {
    this.props = { ...Field.defaultProps, ...props }
    this.initialized = false
    this.loading = false
    this.validating = false
    this.modified = false
    this.active = false
    this.visited = false
    this.mounted = false
    this.unmounted = false
    this.void = this.props.void
    this.display = this.props.display
    this.pattern = this.props.pattern
    this.validator = this.props.validator
    this.decorator = this.props.decorator
    this.component = this.props.component
    this.inputValues = []
  }

  get parent() {
    let parent = this.path.parent()
    let identifier = parent.toString()
    while (!this.form.fields[identifier]) {
      parent = parent.parent()
      identifier = parent.toString()
    }
    return this.form.fields[identifier]
  }

  get array() {
    let parent = this.path.parent()
    let identifier = parent.toString()
    while (!isArr(this.form.fields[identifier]?.value)) {
      parent = parent.parent()
      identifier = parent.toString()
      if (!identifier) return
    }
    return this.form.fields[identifier]
  }

  get key() {
    return this.path?.segments[this.path.segments.length - 1]
  }

  get index() {
    for (let i = this.path?.segments.length - 1; i >= 0; i--) {
      const item = this.path.segments[i]
      if (isNum(item)) return item
    }
  }

  get errors() {
    return this.form.feedback.find({ path: this.path, type: 'error' })
  }

  get warnings() {
    return this.form.feedback.find({ path: this.path, type: 'warning' })
  }

  get successes() {
    return this.form.feedback.find({ path: this.path, type: 'success' })
  }

  get value() {
    const value = this.form.getValuesIn(this.path)
    if (this.modified) {
      return value
    }
    return isValid(value) ? value : this.initialValue
  }

  get initialValue() {
    return this.form.getInitialValuesIn(this.path)
  }

  get computedDisplay() {
    if (this.display) return this.display
    return this.parent?.display
  }

  get computedPattern() {
    if (this.pattern) return this.pattern
    return this.parent?.pattern
  }

  get required() {
    return parseDescriptions(this.validator).some(desc => desc.required)
  }

  getSibling(key: string) {
    const sibling = this.path?.parent()?.concat(key)
    const identifier = sibling?.toString()
    if (identifier && this.form.fields[identifier]) {
      return this.form.fields[identifier]
    }
  }

  getArraySibling(index: number, key?: FormPathPattern) {
    const array = this.array
    const sibling = array?.path?.concat(index).concat(key)
    const identifier = sibling?.toString()
    if (identifier && this.form.fields[identifier]) {
      return this.form.fields[identifier]
    }
  }

  getArrayBeforeSibling(key: FormPathPattern, step: number = 1) {
    return this.getArraySibling(this.index - step, key)
  }

  getArrayAfterSibling(key: FormPathPattern, step: number = 1) {
    return this.getArraySibling(this.index + step, key)
  }

  getChildren(key: number | string) {
    const children = this.path?.concat(key)
    const identifier = children.toString()
    if (this.form.fields[identifier]) {
      return this.form.fields[identifier]
    }
  }

  setErrors(messages: FeedbackMessage) {
    this.form.feedback.update({
      type: 'error',
      code: 'EffectError',
      path: this.path,
      messages
    })
  }

  setWarnings(messages: FeedbackMessage) {
    this.form.feedback.update({
      type: 'warning',
      code: 'EffectWarning',
      path: this.path,
      messages
    })
  }

  setValidator(validator: FieldValidator) {
    this.validator = validator
  }

  setRequired(required: boolean) {
    const hasRequired = parseDescriptions(this.validator).some(
      desc => 'required' in desc
    )
    if (hasRequired) {
      if (isObj(this.validator)) {
        this.validator['required'] = required
      } else if (isArr(this.validator)) {
        this.validator = this.validator.map(desc => {
          if ('required' in desc) {
            desc.required = required
            return desc
          }
          return desc
        })
      }
    } else {
      if (isObj(this.validator)) {
        this.validator['required'] = required
      } else if (isArr(this.validator)) {
        this.validator.push({
          required: true
        })
      }
    }
  }

  setValue(value?: any) {
    if (this.void) return
    this.form.setValuesIn(this.path, value)
    this.form.notify(LifeCycleTypes.ON_FIELD_VALUE_CHANGE, this)
    this.form.notify(LifeCycleTypes.ON_FORM_VALUES_CHANGE, this.form)
  }

  setInitialValue(initialValue?: any) {
    if (this.void) return
    this.form.setInitialValuesIn(this.path, initialValue)
    this.form.notify(LifeCycleTypes.ON_FIELD_INITIAL_VALUE_CHANGE, this)
    this.form.notify(LifeCycleTypes.ON_FORM_INITIAL_VALUES_CHANGE, this.form)
  }

  setDisplay(type: FieldDisplayTypes) {
    if (type === 'visibility') {
      if (this.display === 'none') {
        this.setValue(this.recycledValue)
        this.recycledValue = null
      }
    } else if (type === 'none') {
      this.recycledValue = toJS(this.value)
      this.setValue()
    }
    this.display = type
  }

  setPattern(type: FieldPatternTypes) {
    this.pattern = type
  }

  setLoading(loading: boolean) {
    this.loading = loading
  }

  setValidating(validating: boolean) {
    this.validating = validating
  }

  setComponent<C extends FunctionComponent>(
    component: C,
    props?: Parameters<C>[0]
  ) {
    if (component) {
      this.component[0] = component as any
    }
    if (props) {
      this.component[1] = props as any
    }
  }

  setComponentProps<C extends FunctionComponent = Component>(
    props?: Parameters<C>[0]
  ) {
    Object.assign(this.component[1], props)
  }

  setDecorator<D extends FunctionComponent>(
    component: D,
    props?: Parameters<D>[0]
  ) {
    if (component) {
      this.decorator[0] = component as any
    }
    if (props) {
      this.decorator[1] = props as any
    }
  }

  setDecoratorProps<D extends FunctionComponent = Decorator>(
    props?: Parameters<D>[0]
  ) {
    Object.assign(this.decorator[1], props)
  }

  onInit() {
    this.initialized = true
    this.form.notify(LifeCycleTypes.ON_FIELD_INIT, this)
    this.validate('onInit')
  }

  onMount() {
    this.mounted = true
    this.unmounted = false
    this.validate('onMount')
    this.form.notify(LifeCycleTypes.ON_FIELD_MOUNT, this)
  }

  onUnmount() {
    this.mounted = false
    this.unmounted = true
    this.validate('onUnmount')
    this.form.notify(LifeCycleTypes.ON_FIELD_UNMOUNT, this)
    if (FormPath.existIn(this.form.values, this.path)) {
      if (
        this.computedDisplay === 'none' ||
        this.computedDisplay === 'visibility'
      ) {
        this.setValue()
      }
    } else {
      delete this.form.fields[this.path.toString()]
    }
  }

  onInput(...args: any[]) {
    if (this.void) return
    this.inputValue = args[0]
    this.inputValues = args
    this.modified = true
    this.form.modified = true
    this.form.setValuesIn(this.path, this.value)
    this.form.notify(LifeCycleTypes.ON_FIELD_VALUE_CHANGE, this)
    this.form.notify(LifeCycleTypes.ON_FIELD_INPUT_CHANGE, this)
    this.form.notify(LifeCycleTypes.ON_FORM_VALUES_CHANGE, this.form)
    this.form.notify(LifeCycleTypes.ON_FORM_INPUT_CHANGE, this.form)
    this.validate('onInput')
  }

  onFocus() {
    this.active = true
    this.visited = true
    this.validate('onFocus')
  }

  onBlur() {
    this.active = false
    this.validate('onBlur')
  }

  makeObservable() {
    makeObservable(this, {
      void: observable,
      display: observable,
      pattern: observable,
      loading: observable,
      validating: observable,
      modified: observable,
      active: observable,
      visited: observable,
      value: observable,
      inputValue: observable,
      inputValues: observable,
      recycledValue: observable,
      initialValue: observable,
      initialized: observable,
      mounted: observable,
      unmounted: observable,
      validator: observable,
      decorator: observable,
      component: observable,
      setDisplay: action,
      setValue: action,
      setPattern: action,
      setInitialValue: action,
      setLoading: action,
      setValidating: action,
      setErrors: action,
      setWarnings: action,
      setValidator: action,
      setRequired: action,
      setComponent: action,
      setComponentProps: action,
      setDecorator: action,
      setDecoratorProps: action,
      onInput: action,
      onMount: action,
      onUnmount: action,
      onFocus: action,
      onBlur: action
    })
  }

  async validate(triggerType?: ValidatorTriggerType) {
    this.setValidating(true)
    this.form.notify(LifeCycleTypes.ON_FIELD_VALIDATE_START, this)
    const results = await validate(this.value, this.validator, {
      triggerType,
      validateFirst: this.form?.props?.validateFirst,
      context: this
    })
    const errors = []
    const warnings = []
    const successes = []
    results.forEach(({ type, message }) => {
      if (type === 'error') errors.push(message)
      if (type === 'warning') warnings.push(message)
      if (type === 'success') warnings.push(message)
    })
    if (errors.length) {
      this.form.feedback.update({
        type: 'error',
        code: 'ValidateError',
        path: this.path,
        messages: errors
      })
    }
    if (warnings.length) {
      this.form.feedback.update({
        type: 'warning',
        code: 'ValidateWarning',
        path: this.path,
        messages: warnings
      })
    }
    if (successes.length) {
      this.form.feedback.update({
        type: 'success',
        code: 'ValidateSuccess',
        path: this.path,
        messages: successes
      })
    }
    this.setValidating(false)
    this.form.notify(LifeCycleTypes.ON_FIELD_VALIDATE_END, this)
    return {
      errors,
      warnings,
      successes
    }
  }

  async reset(options?: IFieldResetOptions) {
    runInAction(() => {
      this.modified = false
      this.visited = false
      this.form.feedback.clear({
        path: this.path
      })
      if (options?.clearInitialValue) {
        this.setInitialValue(undefined)
      }
      if (options?.forceClear) {
        this.inputValue = undefined
        this.inputValues = []
        this.setValue()
      } else {
        this.setValue(this.initialValue)
      }
      this.form.notify(LifeCycleTypes.ON_FIELD_RESET, this)
    })
    if (options?.validate) {
      return await this.validate()
    }
  }

  static defaultProps: IFieldProps = {
    void: false,
    decorator: [],
    component: []
  }
}