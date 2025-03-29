
import React from "react";
import { Whiteboard } from "@/components/whiteboard/Whiteboard";
import { ThemeProvider } from "@/hooks/use-theme";

const Index = () => {
  return (
    <ThemeProvider defaultTheme="light">
      <Whiteboard />
    </ThemeProvider>
  );
};

export default Index;
