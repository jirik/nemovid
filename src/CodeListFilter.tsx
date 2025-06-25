import { Checkbox } from '@mantine/core';
import { type ChangeEvent, useCallback } from 'react';
import type { CodeList, CodeListItem } from './cuzk.ts';

export type CodeListFilterProps = {
  list: CodeList;
  filter: { [code: string]: boolean };
  onChange: (values: { [code: string]: boolean }) => void;
};

export type ItemProps = {
  checked: boolean;
  item: CodeListItem;
  onChange: (values: { [code: string]: boolean }) => void;
};

const Item = (props: ItemProps) => {
  const { checked, item, onChange } = props;
  const code = item.code;
  const onChangeCb = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ [code]: event.currentTarget.checked });
    },
    [code, onChange],
  );
  return (
    <Checkbox
      checked={checked}
      onChange={onChangeCb}
      tabIndex={-1}
      label={item.label}
    />
  );
};

export function CodeListFilter(props: CodeListFilterProps) {
  const { list, filter, onChange } = props;
  return (
    <div>
      <h4>{list.label}</h4>
      <div>
        {Object.values(list.values).map((item) => {
          return (
            <Item
              key={item.code}
              checked={filter[item.code]}
              item={item}
              onChange={onChange}
            />
          );
        })}
      </div>
    </div>
  );
}
