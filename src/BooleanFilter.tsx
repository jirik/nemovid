import { useCallback } from 'react';

import { Button } from '@mantine/core';

export type BooleanFilterProps = {
  label: string;
  valueLabels: {
    true: string;
    false: string;
    any: string;
  };
  filter: boolean | null;
  onChange: (value: boolean | null) => void;
};

export type BooleanButtonProps = {
  label: string;
  value: boolean | null;
  checked: boolean;
  onActivation: (value: boolean | null) => void;
};

const BooleanButton = (props: BooleanButtonProps) => {
  // console.log('props', props);
  const { value, onActivation, checked, label } = props;
  const onClickCb = useCallback(() => {
    if (!checked) {
      onActivation(value);
    }
  }, [value, onActivation, checked]);
  return (
    <Button variant={checked ? 'filled' : 'default'} onClick={onClickCb}>
      {label}
    </Button>
  );
};

export function BooleanFilter(props: BooleanFilterProps) {
  const { label, valueLabels, filter, onChange } = props;
  return (
    <div>
      <h4>{label}</h4>
      <div>
        <Button.Group>
          <BooleanButton
            label={valueLabels.true}
            value={true}
            checked={filter === true}
            onActivation={onChange}
          />
          <BooleanButton
            label={valueLabels.false}
            value={false}
            checked={filter === false}
            onActivation={onChange}
          />
          <BooleanButton
            label={valueLabels.any}
            value={null}
            checked={filter === null}
            onActivation={onChange}
          />
        </Button.Group>
      </div>
    </div>
  );
}
