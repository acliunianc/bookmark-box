import './chrome-stub'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Chip,
  CloseButton,
  ColorSwatch,
  ColorSwatchPicker,
  Dropdown,
  EmptyState,
  Input,
  Kbd,
  Label,
  ListBox,
  Modal,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  Separator,
  Switch,
  Tag,
  TagGroup,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@heroui/react'
import '../src/styles/global.css'

const SORTS = [
  { key: 'lastOpened', label: '最近打开' },
  { key: 'created', label: '添加时间' },
  { key: 'openCount', label: '打开次数' },
]

const TAG_ITEMS = [
  { id: 'java', name: 'java', count: 34 },
  { id: 'php', name: 'php', count: 12 },
  { id: '前端', name: '前端', count: 86 },
]

const SWATCHES = ['#f97316', '#8b5cf6', '#06b6d4', '#22c55e', '#f43f5e']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--separator)] p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

function App() {
  const [sort, setSort] = useState<string>('lastOpened')
  const [logic, setLogic] = useState<string>('AND')
  const [selected, setSelected] = useState<Set<string>>(new Set(['java']))
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [checks, setChecks] = useState<string[]>(['a'])
  const [radio, setRadio] = useState('append')
  const [sw, setSw] = useState(true)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [color, setColor] = useState('#f97316')
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Section title="Select（排序 / AND-OR）">
        <Select
          className="w-36"
          variant="secondary"
          aria-label="排序"
          selectedKey={sort}
          onSelectionChange={(key) => setSort(String(key))}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {SORTS.map((option) => (
                <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          className="w-36"
          aria-label="组合逻辑"
          selectedKey={logic}
          onSelectionChange={(key) => setLogic(String(key))}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="AND" textValue="AND 交集">
                AND 交集
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="OR" textValue="OR 并集">
                OR 并集
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </Section>

      <Section title="Tag / TagGroup（左侧标签筛选）">
        <TagGroup
          aria-label="标签筛选"
          selectionMode="multiple"
          selectedKeys={selected}
          onSelectionChange={(keys) => setSelected(new Set([...keys].map(String)))}
        >
          <TagGroup.List className="flex flex-wrap gap-1.5">
            {TAG_ITEMS.map((tag) => (
              <Tag key={tag.id} id={tag.id} textValue={tag.name}>
                <span className="size-1.5 rounded-full bg-current opacity-70" />
                {tag.name}
                <span className="opacity-60">{tag.count}</span>
                <Tag.RemoveButton />
              </Tag>
            ))}
          </TagGroup.List>
        </TagGroup>
      </Section>

      <Section title="Chip">
        <Chip color="default" variant="soft" size="sm">
          <Chip.Label>默认 soft</Chip.Label>
        </Chip>
        <Chip color="accent" variant="primary">
          <Chip.Label>accent primary</Chip.Label>
        </Chip>
        <Chip color="accent" variant="soft">
          <Chip.Label>accent soft</Chip.Label>
        </Chip>
        <Chip color="danger" variant="soft">
          <Chip.Label>danger soft</Chip.Label>
        </Chip>
        <Chip color="success" variant="soft">
          <Chip.Label>success soft</Chip.Label>
        </Chip>
        <Chip color="warning" variant="soft">
          <Chip.Label>warning soft</Chip.Label>
        </Chip>
        <Chip variant="tertiary">
          <Chip.Label>tertiary</Chip.Label>
        </Chip>
      </Section>

      <Section title="Button">
        {(['primary', 'secondary', 'tertiary', 'ghost', 'outline', 'danger', 'danger-soft'] as const).map(
          (variant) => (
            <Button key={variant} size="sm" variant={variant}>
              {variant}
            </Button>
          ),
        )}
        <Button size="sm" isIconOnly variant="ghost" aria-label="图标按钮">
          ⋯
        </Button>
        <Button size="sm" variant="ghost" isDisabled>
          禁用
        </Button>
      </Section>

      <Section title="ToggleButtonGroup（视图切换）">
        <ToggleButtonGroup
          aria-label="视图"
          selectionMode="single"
          selectedKeys={new Set([view])}
          onSelectionChange={(keys) => {
            const first = [...keys][0]
            if (first) setView(String(first) as 'list' | 'grid')
          }}
        >
          <ToggleButton id="list">列表</ToggleButton>
          <ToggleButton id="grid">网格</ToggleButton>
        </ToggleButtonGroup>
      </Section>

      <Section title="SearchField / TextField / Input">
        <SearchField className="w-56" aria-label="搜索" value={search} onChange={setSearch}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="搜索书签…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <TextField className="w-40" aria-label="过滤标签名">
          <Label className="text-xs">标签名</Label>
          <Input placeholder="过滤标签名" value={text} onChange={(e) => setText(e.target.value)} />
        </TextField>
      </Section>

      <Section title="Checkbox / CheckboxGroup / Radio / RadioGroup / Switch">
        <CheckboxGroup aria-label="复选" value={checks} onChange={(value) => setChecks(value as string[])}>
          <Checkbox value="a">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>追加标签</Checkbox.Content>
          </Checkbox>
          <Checkbox value="b">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>替换标签</Checkbox.Content>
          </Checkbox>
        </CheckboxGroup>

        <RadioGroup aria-label="模式" value={radio} onChange={setRadio}>
          <Radio value="append">
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>追加</Radio.Content>
          </Radio>
          <Radio value="replace">
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>替换</Radio.Content>
          </Radio>
        </RadioGroup>

        <Switch isSelected={sw} onChange={setSw}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            递归子文件夹
          </Switch.Content>
        </Switch>
      </Section>

      <Section title="Dropdown / Modal / Tooltip / EmptyState / Kbd / ColorSwatchPicker">
        <Dropdown>
          <Button size="sm" variant="secondary">
            标签操作
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="标签操作">
              <Dropdown.Item id="rename">重命名</Dropdown.Item>
              <Dropdown.Item id="color">改色</Dropdown.Item>
              <Dropdown.Item id="delete" variant="danger">
                删除
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        <Button size="sm" onPress={() => setModalOpen(true)}>
          打开 Modal
        </Button>
        <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
          <Modal.Backdrop>
            <Modal.Container placement="center" size="md">
              <Modal.Dialog>
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>导入浏览器书签</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <p className="text-sm">这里是对话框内容。</p>
                </Modal.Body>
                <Modal.Footer>
                  <Button size="sm" variant="ghost" onPress={() => setModalOpen(false)}>
                    取消
                  </Button>
                  <Button size="sm" onPress={() => setModalOpen(false)}>
                    开始导入
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>

        <Tooltip>
          <Tooltip.Trigger>
            <Button size="sm" variant="ghost">
              hover 我
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>这是提示</Tooltip.Content>
        </Tooltip>

        <EmptyState className="w-64 rounded-[var(--radius)] border border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
          没有匹配的书签
        </EmptyState>

        <Kbd>
          <Kbd.Abbr keyValue="ctrl" /> <Kbd.Content>K</Kbd.Content>
        </Kbd>

        <ColorSwatchPicker aria-label="颜色" value={color} onChange={setColor}>
          {SWATCHES.map((c) => (
            <ColorSwatch key={c} color={c} />
          ))}
        </ColorSwatchPicker>

        <CloseButton aria-label="关闭" />
        <Separator orientation="vertical" className="h-6" />
        <span className="text-xs text-[var(--muted)]">分隔符</span>
      </Section>
    </div>
  )
}

createRoot(document.getElementById('heroui-root')!).render(<App />)

export { App }
