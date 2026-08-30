import React from "react";
import { View, StyleSheet } from "react-native";
import OptativeCourseCard from "./OptativeCourseCard";
import OptativeCarousel from "./OptativeCarousel";

export interface OptativeHomeSectionCourse {
  id: string;
  name: string;
  progress?: number;
}

export interface OptativeHomeSectionProps {
  courses: OptativeHomeSectionCourse[];
  featuredIndex?: number;
  /** Hide the big featured card (e.g. when Home already leads with a
   *  continue-learning card) and show only the circles carousel. */
  showFeatured?: boolean;
  onSelectCourse?: (course: OptativeHomeSectionCourse, index: number) => void;
}

export default function OptativeHomeSection({
  courses,
  featuredIndex = 0,
  showFeatured = true,
  onSelectCourse,
}: OptativeHomeSectionProps) {
  if (courses.length === 0) return null;

  const featured = courses[featuredIndex] ?? courses[0];
  const carouselModules = courses.map((course, index) => ({
    number: index + 1,
    title: course.name,
  }));

  return (
    <View style={styles.container}>
      {showFeatured && (
        <OptativeCourseCard
          title={featured.name}
          subtitle="Optativo"
          progress={featured.progress ?? 0}
          onPress={() => onSelectCourse?.(featured, featuredIndex)}
        />
      )}
      <OptativeCarousel
        modules={carouselModules}
        onSelectModule={(_module, index) =>
          onSelectCourse?.(courses[index], index)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
});
