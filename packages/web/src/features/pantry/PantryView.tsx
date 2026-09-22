import { useHashRoute } from '../../lib/useHashRoute';
import { PantryItemDetail } from './PantryItemDetail';
import { PantryList } from './PantryList';
import { PANTRY_PATH, pantryItemIdFromPath, pantryItemPath } from './routes';

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

  return (
    <PantryList
      onOpen={(id) => {
        navigate(pantryItemPath(id));
      }}
    />
  );
}
