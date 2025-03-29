import React, { useEffect, useRef, useState, MouseEvent, TouchEvent } from "react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { WhiteboardTools, ToolType } from "./WhiteboardTools";
import { ColorPicker } from "./ColorPicker";
import { TextEditor } from "./TextEditor";
import { StickyNote } from "./StickyNote";
import { ImageElement } from "./ImageElement";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useTheme } from "@/hooks/use-theme";

// Define the types for our whiteboard elements
interface Point {
  x: number;
  y: number;
}

type WhiteboardElementType = 
  | "path" 
  | "rectangle" 
  | "circle" 
  | "arrow" 
  | "text" 
  | "note"
  | "image";

interface BaseElement {
  id: string;
  type: WhiteboardElementType;
  color: string;
  strokeWidth: number;
  opacity: number;
}

interface PathElement extends BaseElement {
  type: "path";
  points: Point[];
}

interface ShapeElement extends BaseElement {
  type: "rectangle" | "circle" | "arrow";
  startPoint: Point;
  endPoint: Point;
}

interface TextElement extends BaseElement {
  type: "text";
  position: Point;
  text: string;
  width?: number;
  height?: number;
  align?: "left" | "center" | "right";
  isBold?: boolean;
  isItalic?: boolean;
  isUnderlined?: boolean;
}

interface NoteElement extends BaseElement {
  type: "note";
  position: Point;
  text: string;
  width?: number;
  height?: number;
}

interface ImageElement extends BaseElement {
  type: "image";
  position: Point;
  src: string;
  width: number;
  height: number;
  rotation: number;
}

type Element = PathElement | ShapeElement | TextElement | NoteElement | ImageElement;

// Define Whiteboard Project type
interface WhiteboardProject {
  id: string;
  name: string;
  elements: Element[];
  createdAt: Date;
  updatedAt: Date;
}

export const Whiteboard = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [elements, setElements] = useState<Element[]>([]);
  const [selectedElement, setSelectedElement] = useState<Element | null>(null);
  const [action, setAction] = useState<"none" | "drawing" | "moving" | "erasing">("none");
  const [selectedColor, setSelectedColor] = useState<string>("#000000");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [opacity, setOpacity] = useState<number>(1);
  const [history, setHistory] = useState<Element[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showClearDialog, setShowClearDialog] = useState<boolean>(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState<boolean>(false);
  
  const [projects, setProjects] = useState<WhiteboardProject[]>([]);
  const [currentProject, setCurrentProject] = useState<WhiteboardProject | null>(null);
  const [showProjectDialog, setShowProjectDialog] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>("");
  
  const { theme } = useTheme();

  useEffect(() => {
    const savedProjects = localStorage.getItem('whiteboard-projects');
    if (savedProjects) {
      try {
        const parsedProjects = JSON.parse(savedProjects);
        setProjects(parsedProjects.map((project: any) => ({
          ...project,
          createdAt: new Date(project.createdAt),
          updatedAt: new Date(project.updatedAt)
        })));
        
        if (parsedProjects.length > 0) {
          const mostRecent = parsedProjects.reduce((latest: any, project: any) => {
            return new Date(project.updatedAt) > new Date(latest.updatedAt) ? project : latest;
          }, parsedProjects[0]);
          
          setCurrentProject({
            ...mostRecent,
            createdAt: new Date(mostRecent.createdAt),
            updatedAt: new Date(mostRecent.updatedAt)
          });
          setElements(mostRecent.elements);
        }
      } catch (e) {
        console.error('Error loading projects from localStorage', e);
        createNewProject('Untitled Whiteboard');
      }
    } else {
      createNewProject('Untitled Whiteboard');
    }
  }, []);
  
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem('whiteboard-projects', JSON.stringify(projects));
    }
  }, [projects]);
  
  useEffect(() => {
    if (currentProject && elements) {
      updateCurrentProject(elements);
    }
  }, [elements]);
  
  const createNewProject = (name: string) => {
    const newProject: WhiteboardProject = {
      id: Date.now().toString(),
      name,
      elements: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    setProjects(prev => [...prev, newProject]);
    setCurrentProject(newProject);
    setElements([]);
    setHistory([]);
    setHistoryIndex(-1);
    
    toast.success(`Project "${name}" created`);
  };
  
  const updateCurrentProject = (updatedElements: Element[]) => {
    if (!currentProject) return;
    
    const updatedProject = {
      ...currentProject,
      elements: updatedElements,
      updatedAt: new Date()
    };
    
    setCurrentProject(updatedProject);
    setProjects(prev => prev.map(p => 
      p.id === currentProject.id ? updatedProject : p
    ));
  };
  
  const switchProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      setElements(project.elements);
      setHistory([]);
      setHistoryIndex(-1);
      toast.success(`Switched to "${project.name}"`);
    }
  };
  
  const deleteProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    setProjects(prev => prev.filter(p => p.id !== projectId));
    
    if (currentProject && currentProject.id === projectId) {
      const remainingProjects = projects.filter(p => p.id !== projectId);
      if (remainingProjects.length > 0) {
        switchProject(remainingProjects[0].id);
      } else {
        createNewProject('Untitled Whiteboard');
      }
    }
    
    toast.success(`Project "${project.name}" deleted`);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const context = canvas.getContext("2d");
    if (!context) return;
    
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = selectedColor;
    context.lineWidth = strokeWidth;
    context.globalAlpha = opacity;
    
    contextRef.current = context;
    
    const handleResize = () => {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempContext = tempCanvas.getContext("2d");
      if (!tempContext) return;
      
      tempContext.drawImage(canvas, 0, 0);
      
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      if (context) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = selectedColor;
        context.lineWidth = strokeWidth;
        context.globalAlpha = opacity;
        
        context.drawImage(tempCanvas, 0, 0);
      }
    };
    
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    
    if (!canvas || !context) return;
    
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    elements.forEach((element) => {
      if (element.type === "text" || element.type === "note" || element.type === "image") {
        return;
      }
      
      context.strokeStyle = element.color;
      context.lineWidth = element.strokeWidth;
      context.globalAlpha = element.opacity;
      
      context.beginPath();
      
      if (element.type === "path" && element.points.length > 0) {
        context.moveTo(element.points[0].x, element.points[0].y);
        element.points.forEach((point) => {
          context.lineTo(point.x, point.y);
        });
      } else if (["rectangle", "circle", "arrow"].includes(element.type) && "startPoint" in element && "endPoint" in element) {
        if (element.type === "rectangle") {
          context.rect(
            element.startPoint.x,
            element.startPoint.y,
            element.endPoint.x - element.startPoint.x,
            element.endPoint.y - element.startPoint.y
          );
        } else if (element.type === "circle") {
          const centerX = (element.startPoint.x + element.endPoint.x) / 2;
          const centerY = (element.startPoint.y + element.endPoint.y) / 2;
          const radiusX = Math.abs(element.endPoint.x - element.startPoint.x) / 2;
          const radiusY = Math.abs(element.endPoint.y - element.startPoint.y) / 2;
          
          context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        } else if (element.type === "arrow") {
          context.moveTo(element.startPoint.x, element.startPoint.y);
          context.lineTo(element.endPoint.x, element.endPoint.y);
          
          const angle = Math.atan2(
            element.endPoint.y - element.startPoint.y,
            element.endPoint.x - element.startPoint.x
          );
          const headLength = 15;
          
          context.lineTo(
            element.endPoint.x - headLength * Math.cos(angle - Math.PI / 6),
            element.endPoint.y - headLength * Math.sin(angle - Math.PI / 6)
          );
          context.moveTo(element.endPoint.x, element.endPoint.y);
          context.lineTo(
            element.endPoint.x - headLength * Math.cos(angle + Math.PI / 6),
            element.endPoint.y - headLength * Math.sin(angle + Math.PI / 6)
          );
        }
      }
      
      context.stroke();
      context.closePath();
    });
    
    context.strokeStyle = selectedColor;
    context.lineWidth = strokeWidth;
    context.globalAlpha = opacity;
  }, [elements, selectedColor, strokeWidth, opacity]);
  
  const startDrawing = (point: Point) => {
    if (activeTool === "select") {
      const element = getElementAtPosition(point);
      if (element) {
        if (element.type === "path" || element.type === "rectangle" || element.type === "circle" || element.type === "arrow") {
          setSelectedElement(element);
          setAction("moving");
        }
      }
      return;
    }
    
    if (activeTool === "eraser") {
      setAction("erasing");
      const elementToErase = getElementAtPosition(point);
      if (elementToErase) {
        setElements((prevElements) => 
          prevElements.filter((el) => el.id !== elementToErase.id)
        );
        
        setHistory((prevHistory) => {
          const newHistory = prevHistory.slice(0, historyIndex + 1);
          return [...newHistory, elements.filter((el) => el.id !== elementToErase.id)];
        });
        setHistoryIndex((prevIndex) => prevIndex + 1);
      }
      return;
    }
    
    if (activeTool === "text") {
      const id = Date.now().toString();
      const newTextElement: TextElement = {
        id,
        type: "text",
        position: point,
        text: "Type here...",
        color: selectedColor,
        strokeWidth,
        opacity,
        width: 250,
        height: 150
      };
      
      setElements((prevElements) => [...prevElements, newTextElement]);
      
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        return [...newHistory, [...elements, newTextElement]];
      });
      setHistoryIndex((prevIndex) => prevIndex + 1);
      
      return;
    }
    
    if (activeTool === "note") {
      const id = Date.now().toString();
      const newNoteElement: NoteElement = {
        id,
        type: "note",
        position: point,
        text: "New note",
        color: "#ffeb3b",
        strokeWidth,
        opacity,
        width: 200,
        height: 200
      };
      
      setElements((prevElements) => [...prevElements, newNoteElement]);
      
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        return [...newHistory, [...elements, newNoteElement]];
      });
      setHistoryIndex((prevIndex) => prevIndex + 1);
      
      return;
    }
    
    if (activeTool === "image") {
      handleImport();
      return;
    }
    
    setAction("drawing");
    
    const id = Date.now().toString();
    
    if (activeTool === "pen") {
      const newElement: PathElement = {
        id,
        type: "path",
        points: [point],
        color: selectedColor,
        strokeWidth,
        opacity,
      };
      
      setElements((prevElements) => [...prevElements, newElement]);
    } else if (["rectangle", "circle", "arrow"].includes(activeTool)) {
      const shapeType = activeTool as "rectangle" | "circle" | "arrow";
      const newElement: ShapeElement = {
        id,
        type: shapeType,
        startPoint: point,
        endPoint: point,
        color: selectedColor,
        strokeWidth,
        opacity,
      };
      
      setElements((prevElements) => [...prevElements, newElement]);
    }
  };
  
  const draw = (point: Point) => {
    if (action === "none") return;
    
    if (action === "erasing") {
      const elementToErase = getElementAtPosition(point);
      if (elementToErase) {
        setElements((prevElements) => 
          prevElements.filter((el) => el.id !== elementToErase.id)
        );
      }
      return;
    }
    
    if (action === "drawing") {
      const index = elements.length - 1;
      const element = elements[index];
      
      if (activeTool === "pen" && element.type === "path") {
        setElements((prevElements) => {
          const newElement = {
            ...element,
            points: [...element.points, point],
          };
          return [...prevElements.slice(0, index), newElement];
        });
      } else if (["rectangle", "circle", "arrow"].includes(activeTool) && 
                (element.type === "rectangle" || element.type === "circle" || element.type === "arrow")) {
        setElements((prevElements) => {
          const newElement = {
            ...element,
            endPoint: point,
          };
          return [...prevElements.slice(0, index), newElement];
        });
      }
    } else if (action === "moving" && selectedElement) {
      // Moving logic handled by individual components now
    }
  };
  
  const finishDrawing = () => {
    if (action === "drawing") {
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        return [...newHistory, elements];
      });
      setHistoryIndex((prevIndex) => prevIndex + 1);
    }
    
    setAction("none");
    setSelectedElement(null);
  };
  
  const handleTextChange = (id: string, newText: string) => {
    setElements((prevElements) => 
      prevElements.map((el) => 
        el.id === id ? { ...el, text: newText } : el
      )
    );
    
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      const updatedElements = elements.map((el) => 
        el.id === id ? { ...el, text: newText } : el
      );
      return [...newHistory, updatedElements];
    });
    setHistoryIndex((prevIndex) => prevIndex + 1);
  };
  
  const handleElementDelete = (id: string) => {
    setElements((prevElements) => 
      prevElements.filter((el) => el.id !== id)
    );
    
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      const updatedElements = elements.filter((el) => el.id !== id);
      return [...newHistory, updatedElements];
    });
    setHistoryIndex((prevIndex) => prevIndex + 1);
    
    toast("Element deleted");
  };
  
  const handlePositionChange = (id: string, newPosition: Point) => {
    setElements((prevElements) => 
      prevElements.map((el) => 
        el.id === id ? { ...el, position: newPosition } : el
      )
    );
  };
  
  const handleTextResize = (id: string, width: number, height: number) => {
    setElements((prevElements) => 
      prevElements.map((el) => 
        el.id === id && (el.type === "text" || el.type === "note") ? { ...el, width, height } : el
      )
    );
    
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      const updatedElements = elements.map((el) => 
        el.id === id && (el.type === "text" || el.type === "note") ? { ...el, width, height } : el
      );
      return [...newHistory, updatedElements];
    });
    setHistoryIndex((prevIndex) => prevIndex + 1);
  };
  
  const handleNoteColorChange = (id: string, newColor: string) => {
    setElements((prevElements) => 
      prevElements.map((el) => 
        el.id === id ? { ...el, color: newColor } : el
      )
    );
    
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      const updatedElements = elements.map((el) => 
        el.id === id ? { ...el, color: newColor } : el
      );
      return [...newHistory, updatedElements];
    });
    setHistoryIndex((prevIndex) => prevIndex + 1);
  };
  
  const handleImageResize = (id: string, width: number, height: number) => {
    setElements((prevElements) => 
      prevElements.map((el) => 
        el.id === id && el.type === "image" ? { ...el, width, height } : el
      )
    );
    
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      const updatedElements = elements.map((el) => 
        el.id === id && el.type === "image" ? { ...el, width, height } : el
      );
      return [...newHistory, updatedElements];
    });
    setHistoryIndex((prevIndex) => prevIndex + 1);
  };
  
  const handleImageRotate = (id: string, rotation: number) => {
    setElements((prevElements) => 
      prevElements.map((el) => 
        el.id === id && el.type === "image" ? { ...el, rotation } : el
      )
    );
    
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      const updatedElements = elements.map((el) => 
        el.id === id && el.type === "image" ? { ...el, rotation } : el
      );
      return [...newHistory, updatedElements];
    });
    setHistoryIndex((prevIndex) => prevIndex + 1);
  };
  
  const getElementAtPosition = (point: Point): Element | null => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      
      if (element.type === "text" || element.type === "note" || element.type === "image") {
        const width = element.type === "image" ? element.width : 
                      (element.type === "text" || element.type === "note") && element.width ? element.width : 200;
        const height = element.type === "image" ? element.height : 
                       (element.type === "text" || element.type === "note") && element.height ? element.height : 200;
                       
        if (point.x >= element.position.x && 
            point.x <= element.position.x + width &&
            point.y >= element.position.y && 
            point.y <= element.position.y + height) {
          return element;
        }
        continue;
      }
      
      if (element.type === "path") {
        for (let j = 0; j < element.points.length - 1; j++) {
          const p1 = element.points[j];
          const p2 = element.points[j + 1];
          const distance = distanceToSegment(point, p1, p2);
          if (distance < 10) return element;
        }
      } else if (element.type === "rectangle" && "startPoint" in element && "endPoint" in element) {
        const minX = Math.min(element.startPoint.x, element.endPoint.x);
        const maxX = Math.max(element.startPoint.x, element.endPoint.x);
        const minY = Math.min(element.startPoint.y, element.endPoint.y);
        const maxY = Math.max(element.startPoint.y, element.endPoint.y);
        
        if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
          return element;
        }
      } else if (element.type === "circle" && "startPoint" in element && "endPoint" in element) {
        const centerX = (element.startPoint.x + element.endPoint.x) / 2;
        const centerY = (element.startPoint.y + element.endPoint.y) / 2;
        const radiusX = Math.abs(element.endPoint.x - element.startPoint.x) / 2;
        const radiusY = Math.abs(element.endPoint.y - element.startPoint.y) / 2;
        
        const normalizedX = (point.x - centerX) / radiusX;
        const normalizedY = (point.y - centerY) / radiusY;
        const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
        
        if (distance <= 1) {
          return element;
        }
      } else if (element.type === "arrow" && "startPoint" in element && "endPoint" in element) {
        const distance = distanceToSegment(point, element.startPoint, element.endPoint);
        if (distance < 10) return element;
      }
    }
    
    return null;
  };
  
  const distanceToSegment = (point: Point, p1: Point, p2: Point): number => {
    const A = point.x - p1.x;
    const B = point.y - p1.y;
    const C = p2.x - p1.x;
    const D = p2.y - p1.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    
    if (param < 0) {
      xx = p1.x;
      yy = p1.y;
    } else if (param > 1) {
      xx = p2.x;
      yy = p2.y;
    } else {
      xx = p1.x + param * C;
      yy = p1.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
      toast("Undo");
    }
  };
  
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
      toast("Redo");
    }
  };
  
  const handleClear = () => {
    setShowClearDialog(true);
  };
  
  const confirmClear = () => {
    setElements([]);
    setHistory([]);
    setHistoryIndex(-1);
    setShowClearDialog(false);
    toast("Canvas cleared");
  };
  
  const handleExport = () => {
    if (!canvasRef.current) return;
    
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvasRef.current.width;
    exportCanvas.height = canvasRef.current.height;
    const exportContext = exportCanvas.getContext("2d");
    
    if (!exportContext) return;
    
    exportContext.fillStyle = theme === "dark" ? "#171717" : "#ffffff";
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    exportContext.drawImage(canvasRef.current, 0, 0);
    
    const renderNonCanvasElements = () => {
      const domElements = document.querySelectorAll('[data-element-id]');
      
      domElements.forEach(element => {
        html2canvas(element as HTMLElement).then(canvas => {
          const elementId = element.getAttribute('data-element-id');
          const foundElement = elements.find(el => el.id === elementId);
          
          if (foundElement) {
            if (foundElement.type === 'image') {
              const imgElement = foundElement as ImageElement;
              exportContext.save();
              exportContext.translate(
                imgElement.position.x + imgElement.width / 2,
                imgElement.position.y + imgElement.height / 2
              );
              exportContext.rotate((imgElement.rotation * Math.PI) / 180);
              exportContext.drawImage(
                canvas,
                -imgElement.width / 2,
                -imgElement.height / 2,
                imgElement.width,
                imgElement.height
              );
              exportContext.restore();
            } else if (foundElement.type === 'text' || foundElement.type === 'note') {
              const positionedElement = foundElement as TextElement | NoteElement;
              exportContext.drawImage(canvas, positionedElement.position.x, positionedElement.position.y);
            }
          }
        });
      });
    };
    
    renderNonCanvasElements();
    
    const link = document.createElement("a");
    link.download = currentProject ? `${currentProject.name}.png` : "whiteboard.png";
    link.href = exportCanvas.toDataURL();
    link.click();
    
    toast("Canvas exported as PNG");
  };
  
  const handleImport = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target?.result) return;
        
        const img = new Image();
        img.onload = () => {
          const canvasWidth = canvasRef.current?.width || window.innerWidth;
          const canvasHeight = canvasRef.current?.height || window.innerHeight;
          
          const maxWidth = canvasWidth * 0.8;
          const maxHeight = canvasHeight * 0.8;
          
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            const ratio = maxWidth / width;
            width = maxWidth;
            height = height * ratio;
          }
          
          if (height > maxHeight) {
            const ratio = maxHeight / height;
            height = maxHeight;
            width = width * ratio;
          }
          
          const position = {
            x: (canvasWidth - width) / 2,
            y: (canvasHeight - height) / 2,
          };
          
          const id = Date.now().toString();
          const newImageElement: ImageElement = {
            id,
            type: "image",
            position,
            src: event.target.result as string,
            width,
            height,
            rotation: 0,
            color: "#ffffff",
            strokeWidth: 0,
            opacity: 1,
          };
          
          setElements((prevElements) => [...prevElements, newImageElement]);
          
          setHistory((prevHistory) => {
            const newHistory = prevHistory.slice(0, historyIndex + 1);
            return [...newHistory, [...elements, newImageElement]];
          });
          setHistoryIndex((prevIndex) => prevIndex + 1);
          
          toast("Image added to canvas");
        };
        img.src = event.target.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      toast.error("Unsupported file type. Please upload an image.");
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    startDrawing(point);
  };
  
  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (action === "none") return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    draw(point);
  };
  
  const handleMouseUp = () => {
    finishDrawing();
  };
  
  const handleMouseLeave = () => {
    finishDrawing();
  };
  
  const handleTouchStart = (e: TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !e.touches[0]) return;
    
    const point = {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top,
    };
    
    startDrawing(point);
  };
  
  const handleTouchMove = (e: TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    if (action === "none") return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !e.touches[0]) return;
    
    const point = {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top,
    };
    
    draw(point);
  };
  
  const handleTouchEnd = () => {
    finishDrawing();
  };
  
  const getCursorStyle = (): string => {
    switch (activeTool) {
      case "select":
        return "cursor-move";
      case "eraser":
        return "cursor-eraser";
      case "image":
        return "cursor-[url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"black\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><polyline points=\"21 15 16 10 5 21\"/></svg>') 0 24],auto";
      case "text":
        return "cursor-text";
      case "note":
        return "cursor-[url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"black\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z\"/><polyline points=\"14 2 14 8 20 8\"/><line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"/><line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"/><line x1=\"10\" y1=\"9\" x2=\"8\" y2=\"9\"/></svg>') 0 24],auto";
      default:
        return "cursor-crosshair";
    }
  };
  
  return (
    <div className="relative w-full h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`whiteboard-grid w-full h-full ${getCursorStyle()}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      
      {currentProject && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          <div className="bg-background/80 backdrop-blur-sm border rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-sm">
            <div className="text-sm font-medium">{currentProject.name}</div>
            <select 
              className="bg-transparent border-none text-sm focus:outline-none cursor-pointer"
              value={currentProject.id}
              onChange={(e) => switchProject(e.target.value)}
            >
              <option value="" disabled>Switch Project</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button 
              className="ml-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowProjectDialog(true)}
            >
              + New
            </button>
          </div>
        </div>
      )}
      
      {elements.map((element) => {
        if (element.type === "text") {
          return (
            <TextEditor
              key={element.id}
              id={element.id}
              initialText={element.text}
              position={element.position}
              color={element.color}
              width={element.width}
              height={element.height}
              onTextChange={handleTextChange}
              onDelete={handleElementDelete}
              onPositionChange={handlePositionChange}
              onResize={handleTextResize}
            />
          );
        } else if (element.type === "note") {
          return (
            <StickyNote
              key={element.id}
              id={element.id}
              initialText={element.text}
              position={element.position}
              color={element.color}
              width={element.width}
              height={element.height}
              onTextChange={handleTextChange}
              onDelete={handleElementDelete}
              onPositionChange={handlePositionChange}
              onColorChange={handleNoteColorChange}
              onResize={handleTextResize}
            />
          );
        } else if (element.type === "image") {
          return (
            <ImageElement
              key={element.id}
              id={element.id}
              position={element.position}
              src={element.src}
              width={element.width}
              height={element.height}
              rotation={element.rotation}
              onDelete={handleElementDelete}
              onPositionChange={handlePositionChange}
              onResize={handleImageResize}
              onRotate={handleImageRotate}
            />
          );
        }
        return null;
      })}
      
      <WhiteboardTools
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onClear={handleClear}
        onExport={handleExport}
        onImport={handleImport}
        isCollapsed={isToolbarCollapsed}
        toggleCollapse={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
      />
      
      <ColorPicker
        selectedColor={selectedColor}
        setSelectedColor={setSelectedColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        opacity={opacity}
        setOpacity={setOpacity}
      />
      
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileUpload}
      />
      
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All elements will be removed from the canvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClear}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create new project</AlertDialogTitle>
            <AlertDialogDescription>
              <input
                type="text"
                className="w-full px-3 py-2 mt-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNewProjectName("")}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (newProjectName.trim()) {
                  createNewProject(newProjectName);
                  setNewProjectName("");
                  setShowProjectDialog(false);
                }
              }}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
