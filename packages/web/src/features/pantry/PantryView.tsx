import { Button } from '../../components/ui/button';
import { useHashRoute } from '../../lib/useHashRoute';
import { ReceiptsView } from '../receipts/ReceiptsView';
import { PantryItemDetail } from './PantryItemDetail';
import { PantryList } from './PantryList';
import {
  PANTRY_PATH,
  PANTRY_RECEIPTS_PATH,
  isPantryReceiptsPath,
  pantryItemIdFromPath,
  pantryItemPath,
} from './routes';

const PANTRY_VIEWS = [
  { label: 'Items', path: PANTRY_PATH },
  { label: 'Receipts', path: PANTRY_RECEIPTS_PATH },
];

export function PantryView() {
  const { path, navigate } = useHashRoute();
  const itemId = pantryItemIdFromPath(path);

  if (itemId !== null) {
    return (
      <PantryItemDetail
        id={itemId}
        onBack={() => {
          navigate(PANTRY_PATH);
        }}
      />
    );
  }

  const activePath = isPantryReceiptsPath(path) ? PANTRY_RECEIPTS_PATH : PANTRY_PATH;

  return (
    <>
      <nav className="mt-4 flex gap-2" aria-label="Pantry views">
        {PANTRY_VIEWS.map((view) => (
          <Button
            key={view.path}
            variant={activePath === view.path ? 'default' : 'outline'}
            aria-pressed={activePath === view.path}
            onClick={() => {
              navigate(view.path);
            }}
          >
            {view.label}
          </Button>
        ))}
      </nav>
      {activePath === PANTRY_RECEIPTS_PATH ? (
        <ReceiptsView />
      ) : (
        <PantryList
          onOpen={(id) => {
            navigate(pantryItemPath(id));
          }}
        />
      )}
    </>
  );
}
