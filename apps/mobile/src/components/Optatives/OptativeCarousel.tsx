import React from "react";
import { FlatList, StyleSheet } from "react-native";
import OptativeModuleCard, {
  OptativeModuleCardProps,
} from "./OptativeModuleCard";

export interface OptativeCarouselProps {
  modules: Omit<OptativeModuleCardProps, "onPress">[];
  onSelectModule?: (module: OptativeModuleCardProps, index: number) => void;
}

/**
 * Memoized row: onSelectModule is expected to be stable (useCallback at the
 * call site), so cards skip re-rendering when the parent's unrelated state
 * (loading flags, progress counters) changes.
 */
const CarouselItem = React.memo(function CarouselItem({
  module,
  index,
  onSelectModule,
}: {
  module: Omit<OptativeModuleCardProps, "onPress">;
  index: number;
  onSelectModule?: (module: OptativeModuleCardProps, index: number) => void;
}) {
  return (
    <OptativeModuleCard
      {...module}
      onPress={() => onSelectModule?.({ ...module, onPress: undefined }, index)}
    />
  );
});

export default function OptativeCarousel({
  modules,
  onSelectModule,
}: OptativeCarouselProps) {
  return (
    <FlatList
      horizontal
      data={modules}
      // `number` is the module's stable identity within the track (1..n);
      // title alone repeats across tracks, title+index re-keys on reorder.
      keyExtractor={(module) => String(module.number)}
      renderItem={({ item, index }) => (
        <CarouselItem
          module={item}
          index={index}
          onSelectModule={onSelectModule}
        />
      )}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      decelerationRate="fast"
      snapToAlignment="start"
      snapToInterval={138}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
});
