using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
using System.IO;

public class SceneSetup
{
    [MenuItem("Readify/Setup Scene")]
    public static void BuildScene()
    {
        EnsureDirectories();
        ConfigureSprites();

        Sprite playerSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/Sprites/player.png");
        Sprite docSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/Sprites/document.png");
        Sprite obstacleSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/Sprites/obstacle.png");
        Sprite bgSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/Sprites/background.png");

        GameObject docPrefab = CreateDocumentPrefab(docSprite);
        GameObject obstaclePrefab = CreateObstaclePrefab(obstacleSprite);

        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        CreateMainCamera();
        CreateBackground(bgSprite);
        CreatePlayer(playerSprite);

        GameObject spawnerObj = new GameObject("Spawners");
        DocumentSpawner docSpawner = spawnerObj.AddComponent<DocumentSpawner>();
        docSpawner.documentPrefab = docPrefab;
        docSpawner.spawnInterval = 1.2f;
        docSpawner.xRange = 7.5f;
        docSpawner.spawnY = 5.5f;

        ObstacleSpawner obsSpawner = spawnerObj.AddComponent<ObstacleSpawner>();
        obsSpawner.obstaclePrefab = obstaclePrefab;
        obsSpawner.spawnInterval = 2.0f;
        obsSpawner.xRange = 7.5f;
        obsSpawner.spawnY = 5.5f;

        CreateEventSystem();

        Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        if (font == null)
        {
            font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        }

        GameObject canvasObj = new GameObject("Canvas");
        Canvas canvas = canvasObj.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        CanvasScaler scaler = canvasObj.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        canvasObj.AddComponent<GraphicRaycaster>();

        GameObject hudObj = new GameObject("HUD");
        hudObj.transform.SetParent(canvasObj.transform, false);

        Text scoreText = CreateText(hudObj, "ScoreText", "Score: 0", font, 36, TextAnchor.MiddleLeft, new Vector2(40, -40), new Vector2(0, 1), new Vector2(0, 1), new Vector2(300, 60), new Color(0.22f, 0.74f, 0.97f));
        Text livesText = CreateText(hudObj, "LivesText", "Lives: 3", font, 36, TextAnchor.MiddleRight, new Vector2(-40, -40), new Vector2(1, 1), new Vector2(1, 1), new Vector2(300, 60), new Color(0.94f, 0.27f, 0.27f));

        GameObject titlePanel = CreateTitlePanel(canvasObj, font, out Button startButton);
        GameObject gameOverPanel = CreateGameOverPanel(canvasObj, font, out Text finalScoreText, out Button restartButton);

        GameObject gmObj = new GameObject("GameManager");
        GameManager gm = gmObj.AddComponent<GameManager>();
        gm.scoreText = scoreText;
        gm.livesText = livesText;
        gm.titlePanel = titlePanel;
        gm.startButton = startButton;
        gm.gameOverPanel = gameOverPanel;
        gm.finalScoreText = finalScoreText;
        gm.restartButton = restartButton;

        EditorSceneManager.SaveScene(scene, "Assets/Scenes/MainScene.unity");

        EditorBuildSettingsScene[] scenes = new EditorBuildSettingsScene[]
        {
            new EditorBuildSettingsScene("Assets/Scenes/MainScene.unity", true)
        };
        EditorBuildSettings.scenes = scenes;

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("Readify: Document Collector scene setup complete.");
    }

    private static void EnsureDirectories()
    {
        if (!Directory.Exists("Assets/Scenes")) Directory.CreateDirectory("Assets/Scenes");
        if (!Directory.Exists("Assets/Prefabs")) Directory.CreateDirectory("Assets/Prefabs");
        if (!Directory.Exists("Assets/Sprites")) Directory.CreateDirectory("Assets/Sprites");
    }

    private static void ConfigureSprites()
    {
        string[] spriteNames = new string[] { "player", "document", "obstacle", "background" };
        foreach (string s in spriteNames)
        {
            string path = "Assets/Sprites/" + s + ".png";
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer != null)
            {
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.mipmapEnabled = false;
                importer.filterMode = FilterMode.Bilinear;
                importer.SaveAndReimport();
            }
        }
    }

    private static GameObject CreateDocumentPrefab(Sprite sprite)
    {
        GameObject doc = new GameObject("Document");
        doc.tag = "Document";
        SpriteRenderer sr = doc.AddComponent<SpriteRenderer>();
        sr.sprite = sprite;
        sr.sortingOrder = 1;
        BoxCollider2D col = doc.AddComponent<BoxCollider2D>();
        col.isTrigger = true;
        FallingObject fo = doc.AddComponent<FallingObject>();
        fo.fallSpeed = 3.5f;
        fo.bottomLimit = -6f;
        fo.isObstacle = false;

        string prefabPath = "Assets/Prefabs/Document.prefab";
        GameObject prefab = PrefabUtility.SaveAsPrefabAsset(doc, prefabPath);
        Object.DestroyImmediate(doc);
        return prefab;
    }

    private static GameObject CreateObstaclePrefab(Sprite sprite)
    {
        GameObject obs = new GameObject("Obstacle");
        obs.tag = "Obstacle";
        SpriteRenderer sr = obs.AddComponent<SpriteRenderer>();
        sr.sprite = sprite;
        sr.sortingOrder = 1;
        CircleCollider2D col = obs.AddComponent<CircleCollider2D>();
        col.isTrigger = true;
        FallingObject fo = obs.AddComponent<FallingObject>();
        fo.fallSpeed = 4.0f;
        fo.bottomLimit = -6f;
        fo.isObstacle = true;

        string prefabPath = "Assets/Prefabs/Obstacle.prefab";
        GameObject prefab = PrefabUtility.SaveAsPrefabAsset(obs, prefabPath);
        Object.DestroyImmediate(obs);
        return prefab;
    }

    private static void CreateMainCamera()
    {
        GameObject camObj = new GameObject("Main Camera");
        camObj.tag = "MainCamera";
        Camera cam = camObj.AddComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = 5f;
        cam.backgroundColor = new Color(0.04f, 0.06f, 0.11f, 1f);
        cam.clearFlags = CameraClearFlags.SolidColor;
        camObj.AddComponent<AudioListener>();
        camObj.transform.position = new Vector3(0, 0, -10);
    }

    private static void CreateBackground(Sprite sprite)
    {
        GameObject bgObj = new GameObject("Background");
        SpriteRenderer sr = bgObj.AddComponent<SpriteRenderer>();
        sr.sprite = sprite;
        sr.sortingOrder = -10;
        bgObj.transform.position = Vector3.zero;
        bgObj.transform.localScale = new Vector3(1.9f, 1.9f, 1f);
    }

    private static void CreatePlayer(Sprite sprite)
    {
        GameObject player = new GameObject("Player");
        player.tag = "Player";
        SpriteRenderer sr = player.AddComponent<SpriteRenderer>();
        sr.sprite = sprite;
        sr.sortingOrder = 2;
        BoxCollider2D col = player.AddComponent<BoxCollider2D>();
        col.size = new Vector2(0.8f, 0.5f);
        Rigidbody2D rb = player.AddComponent<Rigidbody2D>();
        rb.bodyType = RigidbodyType2D.Dynamic;
        rb.gravityScale = 0f;
        rb.freezeRotation = true;
        rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
        PlayerController pc = player.AddComponent<PlayerController>();
        pc.moveSpeed = 8f;
        pc.xLimit = 7.5f;
        pc.yLimit = 4.2f;
        player.transform.position = new Vector3(0, -3.5f, 0);
    }

    private static void CreateEventSystem()
    {
        GameObject esObj = new GameObject("EventSystem");
        esObj.AddComponent<EventSystem>();
        esObj.AddComponent<StandaloneInputModule>();
    }

    private static GameObject CreateTitlePanel(GameObject canvas, Font font, out Button startButton)
    {
        GameObject panel = new GameObject("TitlePanel");
        panel.transform.SetParent(canvas.transform, false);
        Image img = panel.AddComponent<Image>();
        img.color = new Color(0.06f, 0.09f, 0.16f, 0.92f);
        RectTransform rt = panel.GetComponent<RectTransform>();
        rt.anchorMin = new Vector2(0.5f, 0.5f);
        rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.sizeDelta = new Vector2(700, 420);

        CreateText(panel, "Title", "READIFY: DOCUMENT COLLECTOR", font, 38, TextAnchor.MiddleCenter, new Vector2(0, 130), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(650, 60), new Color(0.22f, 0.74f, 0.97f));
        CreateText(panel, "Subtitle", "ISD Coursework - Interactive 2D Document Digitizer", font, 20, TextAnchor.MiddleCenter, new Vector2(0, 80), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(650, 40), new Color(0.58f, 0.65f, 0.75f));
        CreateText(panel, "Instructions", "Catch falling document pages to boost score!\nAvoid red hazard obstacles to preserve lives.\nControls: WASD or Arrow Keys.\nPress Space or Enter to begin.", font, 22, TextAnchor.MiddleCenter, new Vector2(0, 0), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(650, 100), Color.white);

        GameObject btnObj = new GameObject("StartButton");
        btnObj.transform.SetParent(panel.transform, false);
        Image btnImg = btnObj.AddComponent<Image>();
        btnImg.color = new Color(0.01f, 0.52f, 0.78f, 1f);
        startButton = btnObj.AddComponent<Button>();
        RectTransform btnRt = btnObj.GetComponent<RectTransform>();
        btnRt.anchorMin = new Vector2(0.5f, 0.5f);
        btnRt.anchorMax = new Vector2(0.5f, 0.5f);
        btnRt.anchoredPosition = new Vector2(0, -130);
        btnRt.sizeDelta = new Vector2(240, 54);

        CreateText(btnObj, "Text", "START GAME", font, 22, TextAnchor.MiddleCenter, Vector2.zero, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(240, 54), Color.white);

        return panel;
    }

    private static GameObject CreateGameOverPanel(GameObject canvas, Font font, out Text finalScoreText, out Button restartButton)
    {
        GameObject panel = new GameObject("GameOverPanel");
        panel.transform.SetParent(canvas.transform, false);
        Image img = panel.AddComponent<Image>();
        img.color = new Color(0.12f, 0.04f, 0.05f, 0.94f);
        RectTransform rt = panel.GetComponent<RectTransform>();
        rt.anchorMin = new Vector2(0.5f, 0.5f);
        rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.sizeDelta = new Vector2(650, 380);

        CreateText(panel, "Title", "GAME OVER", font, 48, TextAnchor.MiddleCenter, new Vector2(0, 100), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(600, 70), new Color(0.94f, 0.27f, 0.27f));
        finalScoreText = CreateText(panel, "FinalScore", "Final Score: 0", font, 30, TextAnchor.MiddleCenter, new Vector2(0, 30), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(600, 50), Color.white);
        CreateText(panel, "Hint", "Press R, Space, or Enter to restart", font, 18, TextAnchor.MiddleCenter, new Vector2(0, -30), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(600, 40), new Color(0.58f, 0.65f, 0.75f));

        GameObject btnObj = new GameObject("RestartButton");
        btnObj.transform.SetParent(panel.transform, false);
        Image btnImg = btnObj.AddComponent<Image>();
        btnImg.color = new Color(0.86f, 0.15f, 0.15f, 1f);
        restartButton = btnObj.AddComponent<Button>();
        RectTransform btnRt = btnObj.GetComponent<RectTransform>();
        btnRt.anchorMin = new Vector2(0.5f, 0.5f);
        btnRt.anchorMax = new Vector2(0.5f, 0.5f);
        btnRt.anchoredPosition = new Vector2(0, -110);
        btnRt.sizeDelta = new Vector2(240, 54);

        CreateText(btnObj, "Text", "RESTART", font, 22, TextAnchor.MiddleCenter, Vector2.zero, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(240, 54), Color.white);

        panel.SetActive(false);
        return panel;
    }

    private static Text CreateText(GameObject parent, string name, string content, Font font, int fontSize, TextAnchor alignment, Vector2 anchoredPos, Vector2 anchorMin, Vector2 anchorMax, Vector2 sizeDelta, Color color)
    {
        GameObject textObj = new GameObject(name);
        textObj.transform.SetParent(parent.transform, false);
        Text text = textObj.AddComponent<Text>();
        text.text = content;
        text.font = font;
        text.fontSize = fontSize;
        text.alignment = alignment;
        text.color = color;
        RectTransform rt = textObj.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.anchoredPosition = anchoredPos;
        rt.sizeDelta = sizeDelta;
        return text;
    }
}
