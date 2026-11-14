using UnityEngine;

public class DocumentSpawner : MonoBehaviour
{
    public GameObject documentPrefab;
    public float spawnInterval = 1.2f;
    public float xRange = 7.5f;
    public float spawnY = 5.5f;

    private float timer = 0f;

    private void Update()
    {
        if (GameManager.Instance != null && !GameManager.Instance.IsPlaying())
        {
            return;
        }

        timer -= Time.deltaTime;
        if (timer <= 0f)
        {
            SpawnDocument();
            timer = spawnInterval;
        }
    }

    private void SpawnDocument()
    {
        if (documentPrefab == null)
        {
            return;
        }

        float randomX = Random.Range(-xRange, xRange);
        Vector3 spawnPosition = new Vector3(randomX, spawnY, 0f);
        Instantiate(documentPrefab, spawnPosition, Quaternion.identity);
    }
}
