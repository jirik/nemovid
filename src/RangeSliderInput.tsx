import { NumberInput, RangeSlider } from '@mantine/core';
import { useCallback } from 'react';
import classes from './SliderInput.module.css';

export type RangeSliderInputProps = {
  minValue: number;
  maxValue: number;
  values: [number, number];
  minLabel: string;
  maxLabel: string;
  onChange: (values: [number, number]) => void;
};

export function RangeSliderInput(props: RangeSliderInputProps) {
  const minCb = useCallback(
    (value: string | number) => {
      const minv = typeof value === 'string' ? Number.parseInt(value) : value;
      const maxv = Math.max(minv, props.values[1]);
      props.onChange([minv, maxv]);
    },
    [props.onChange, props.values],
  );

  const maxCb = useCallback(
    (value: string | number) => {
      const maxv = typeof value === 'string' ? Number.parseInt(value) : value;
      const minv = Math.min(props.values[0], maxv);
      props.onChange([minv, maxv]);
    },
    [props.onChange, props.values],
  );

  const step = 1;

  return (
    <div className={classes.wrapper}>
      <div className={classes.inputs}>
        <NumberInput
          value={props.values[0]}
          onChange={minCb}
          label={props.minLabel}
          placeholder=""
          step={step}
          min={props.minValue}
          max={props.maxValue}
          hideControls
          classNames={{
            root: classes.inputRoot,
            input: classes.inputInput,
            label: classes.label,
          }}
        />
        <NumberInput
          value={props.values[1]}
          onChange={maxCb}
          label={props.maxLabel}
          placeholder=""
          step={step}
          min={props.minValue}
          max={props.maxValue}
          hideControls
          className={classes.maxInput}
          classNames={{
            root: classes.inputRoot,
            input: classes.inputInput,
            label: classes.label,
          }}
        />
      </div>
      <RangeSlider
        min={props.minValue}
        max={props.maxValue}
        step={step}
        minRange={0}
        label={null}
        value={props.values}
        onChange={props.onChange}
        size={2}
        className={classes.slider}
        classNames={classes}
      />
    </div>
  );
}
